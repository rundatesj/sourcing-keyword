const NAVER_ENDPOINT = "https://datalab.naver.com/shoppingInsight/getCategoryKeywordRank.naver";
const ALLOWED_ORIGIN = "https://rundatesj.github.io";
const PAGE_SIZE = 20;
const PAGE_COUNT = 5;
const MAX_RESPONSE_BYTES = 1_000_000;

function setCors(request, response) {
  const origin = request.headers.origin;
  response.setHeader("Access-Control-Allow-Origin", origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function getKoreaDate(now = new Date()) {
  return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

function lastYearCurrentMonth(now = new Date()) {
  const koreaNow = getKoreaDate(now);
  const year = koreaNow.getFullYear() - 1;
  const month = koreaNow.getMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthText = String(month).padStart(2, "0");
  return {
    year,
    month,
    startDate: `${year}-${monthText}-01`,
    endDate: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`,
  };
}

function selectedPeriod(yearValue, monthValue, now = new Date()) {
  if (!yearValue && !monthValue) return lastYearCurrentMonth(now);
  if (!/^\d{4}$/.test(yearValue || "") || !/^\d{1,2}$/.test(monthValue || "")) {
    throw new Error("INVALID_PERIOD");
  }

  const year = Number(yearValue);
  const month = Number(monthValue);
  const koreaNow = getKoreaDate(now);
  const currentYear = koreaNow.getFullYear();
  const currentMonth = koreaNow.getMonth() + 1;
  const selectedIndex = year * 12 + month;
  const earliestIndex = 2017 * 12 + 8;
  const currentIndex = currentYear * 12 + currentMonth;

  if (month < 1 || month > 12 || selectedIndex < earliestIndex || selectedIndex > currentIndex) {
    throw new Error("INVALID_PERIOD");
  }

  const lastDay = selectedIndex === currentIndex
    ? koreaNow.getDate() - 1
    : new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (lastDay < 1) throw new Error("PERIOD_NOT_AVAILABLE");

  const monthText = String(month).padStart(2, "0");
  return {
    year,
    month,
    startDate: `${year}-${monthText}-01`,
    endDate: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`,
  };
}

function isKeywordItem(value) {
  return Boolean(
    value
    && typeof value === "object"
    && Number.isInteger(value.rank)
    && typeof value.keyword === "string"
    && value.keyword.trim().length > 0,
  );
}

async function requestRankPage(categoryId, startDate, endDate, page) {
  const body = new URLSearchParams({
    cid: categoryId,
    timeUnit: "date",
    startDate,
    endDate,
    age: "",
    gender: "",
    device: "",
    page: String(page),
    count: String(PAGE_SIZE),
  });

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const naverResponse = await fetch(NAVER_ENDPOINT, {
        method: "POST",
        redirect: "manual",
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Origin: "https://datalab.naver.com",
          Referer: `https://datalab.naver.com/shoppingInsight/sCategory.naver?cid=${categoryId}`,
          "User-Agent": "Mozilla/5.0 (compatible; SourcingKeywordTool/1.0)",
          "X-Requested-With": "XMLHttpRequest",
        },
        body,
      });

      if (naverResponse.status >= 300 && naverResponse.status < 400) {
        throw new Error(`NAVER_REDIRECT_${naverResponse.status}`);
      }
      if (!naverResponse.ok) throw new Error(`NAVER_HTTP_${naverResponse.status}`);

      const contentLength = Number(naverResponse.headers.get("content-length") || "0");
      if (contentLength > MAX_RESPONSE_BYTES) throw new Error("NAVER_RESPONSE_TOO_LARGE");

      const contentType = naverResponse.headers.get("content-type") || "";
      if (!contentType.includes("json") && !contentType.includes("text/plain")) {
        throw new Error("NAVER_FORMAT_CHANGED");
      }

      const payload = await naverResponse.json();
      if (!Array.isArray(payload?.ranks) || !payload.ranks.every(isKeywordItem)) {
        throw new Error("NAVER_FORMAT_CHANGED");
      }
      return payload.ranks;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("NAVER_REQUEST_FAILED");
    }
  }
  throw lastError || new Error("NAVER_REQUEST_FAILED");
}

async function getPopularKeywords(categoryId, period) {
  const items = [];
  for (let page = 1; page <= PAGE_COUNT; page += 1) {
    items.push(...await requestRankPage(categoryId, period.startDate, period.endDate, page));
  }
  return {
    period: `${period.year}-${String(period.month).padStart(2, "0")}`,
    items: items.slice(0, 100),
  };
}

export default async function handler(request, response) {
  setCors(request, response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") return response.status(405).json({ error: "METHOD_NOT_ALLOWED" });

  const categoryId = String(request.query.categoryId || "").trim();
  if (!/^\d{8}$/.test(categoryId)) {
    return response.status(400).json({ error: "INVALID_CATEGORY_ID", message: "8자리 카테고리 코드가 필요합니다." });
  }

  let period;
  try {
    period = selectedPeriod(request.query.year, request.query.month);
  } catch (error) {
    return response.status(400).json({
      error: error instanceof Error ? error.message : "INVALID_PERIOD",
      message: "2017년 8월부터 현재 월까지 선택할 수 있습니다.",
    });
  }

  try {
    const result = await getPopularKeywords(categoryId, period);
    response.setHeader("Cache-Control", "public, max-age=3600");
    response.setHeader("CDN-Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=86400");
    return response.status(200).json({
      categoryId,
      ...result,
      cachedAt: new Date().toISOString(),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "NAVER_REQUEST_FAILED";
    console.error(JSON.stringify({ event: "naver_keyword_request_failed", categoryId, code }));
    return response.status(502).json({
      error: "NAVER_REQUEST_FAILED",
      code,
      message: "네이버 데이터랩 인기검색어를 현재 조회할 수 없습니다.",
    });
  }
}
