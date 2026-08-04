const MAX_RESULTS = 100;
const API_BASE_URL = "https://sourcing-keyword-api.vercel.app";
const STORAGE_KEY = "sourcing-keyword-worklist-v1";
let categories = [];
let selectedKeywords = loadSelectedKeywords();

const input = document.querySelector("#search");
const clearButton = document.querySelector("#clear");
const list = document.querySelector("#list");
const title = document.querySelector("#result-title");
const count = document.querySelector("#result-count");
const keywordDialog = document.querySelector("#keyword-dialog");
const keywordTitle = document.querySelector("#keyword-title");
const keywordPath = document.querySelector("#keyword-path");
const keywordPeriod = document.querySelector("#keyword-period");
const keywordContent = document.querySelector("#keyword-content");
const periodYear = document.querySelector("#period-year");
const periodMonth = document.querySelector("#period-month");
const workList = document.querySelector("#work-list");
const workCount = document.querySelector("#work-count");
let activeCategoryId = "";

fetch("categories.json")
  .then((response) => response.json())
  .then((data) => { categories = data; runSearch(); })
  .catch(() => { list.innerHTML = '<div class="empty"><b>데이터를 불러오지 못했어요.</b><p>잠시 후 다시 시도해 주세요.</p></div>'; });

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function loadSelectedKeywords() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((item) => typeof item === "string") : [];
  } catch { return []; }
}

function saveSelectedKeywords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedKeywords));
  renderWorkList();
}

function renderWorkList() {
  workCount.textContent = `${selectedKeywords.length}개`;
  if (!selectedKeywords.length) {
    workList.innerHTML = '<div class="workEmpty">인기검색어에서 <b>추가</b>를 누르면 여기에 모입니다.</div>';
    return;
  }
  workList.innerHTML = selectedKeywords.map((keyword, index) => `<button class="keywordChip" data-remove-index="${index}" title="삭제">${escapeHtml(keyword)} <span>×</span></button>`).join("");
}

function setupPeriodSelectors() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const defaultYear = currentYear - 1;
  for (let year = currentYear; year >= 2017; year -= 1) periodYear.add(new Option(`${year}년`, String(year), false, year === defaultYear));
  updateMonthOptions(now.getMonth() + 1);
}

function updateMonthOptions(preferredMonth = Number(periodMonth.value) || 1) {
  const now = new Date();
  const year = Number(periodYear.value);
  const minMonth = year === 2017 ? 8 : 1;
  const maxMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  periodMonth.innerHTML = "";
  const selected = Math.min(Math.max(preferredMonth, minMonth), maxMonth);
  for (let month = 1; month <= 12; month += 1) {
    if (month < minMonth || month > maxMonth) continue;
    periodMonth.add(new Option(`${month}월`, String(month), false, month === selected));
  }
}

function runSearch() {
  const raw = input.value.trim();
  const query = raw.toLowerCase().replace(/\s+/g, "");
  clearButton.hidden = !raw;
  if (!query) {
    title.textContent = "카테고리를 검색해 주세요";
    count.hidden = true;
    list.innerHTML = '<div class="empty"><b>무엇을 판매하시나요?</b><p>상품과 가장 가까운 단어를 입력하면 전체 경로와 코드를 찾아드려요.</p></div>';
    return;
  }
  const matches = categories.filter((item) => item.path.toLowerCase().replace(/\s+/g, "").includes(query) || item.id.includes(query));
  title.textContent = `'${raw}' 검색 결과`;
  count.textContent = `${matches.length.toLocaleString()}개`;
  count.hidden = false;
  if (!matches.length) {
    list.innerHTML = '<div class="empty"><b>검색 결과가 없어요.</b><p>다른 단어 또는 카테고리 코드로 다시 검색해 보세요.</p></div>';
    return;
  }
  list.innerHTML = matches.slice(0, MAX_RESULTS).map((item, index) => {
    const parts = item.path.split(" > ");
    const name = escapeHtml(parts.at(-1));
    const path = escapeHtml(parts.slice(0, -1).join(" › ") || "최상위 카테고리");
    return `<article><span class="number">${String(index + 1).padStart(2, "0")}</span><div class="categoryInfo"><h2>${name}</h2><p>${path}</p></div><code>${item.id}</code><div class="rowActions"><button class="copy" data-copy-id="${item.id}">코드 복사</button><button class="popular" data-keywords-id="${item.id}">인기키워드 조회</button></div></article>`;
  }).join("") + (matches.length > MAX_RESULTS ? `<div class="more">결과가 많아 상위 ${MAX_RESULTS}개만 표시합니다. 검색어를 더 구체적으로 입력해 주세요.</div>` : "");
}

async function openPopularKeywords(categoryId) {
  activeCategoryId = categoryId;
  const category = categories.find((item) => item.id === categoryId);
  keywordTitle.textContent = `${category?.name || categoryId} 인기검색어`;
  keywordPath.textContent = category?.path || categoryId;
  if (!keywordDialog.open) keywordDialog.showModal();
  await fetchPopularKeywords();
}

async function fetchPopularKeywords() {
  const year = periodYear.value;
  const month = periodMonth.value;
  keywordPeriod.textContent = `${year}년 ${String(month).padStart(2, "0")}월 · 전체 조건`;
  keywordContent.innerHTML = '<div class="keywordState"><span class="spinner"></span><b>실제 인기검색어를 불러오는 중입니다.</b><p>네이버 데이터랩 TOP100을 조회하고 있어요.</p></div>';

  try {
    const params = new URLSearchParams({ categoryId: activeCategoryId, year, month });
    const response = await fetch(`${API_BASE_URL}/api/popular-keywords?${params}`);
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.items)) throw new Error(data.message || "조회에 실패했습니다.");
    keywordPeriod.textContent = `${data.period.replace("-", "년 ")}월 · 전체 기기 · 전체 성별 · 전체 연령`;
    keywordContent.innerHTML = `<ol class="keywordList">${data.items.map((item) => `<li><span class="rank">${item.rank}</span><b>${escapeHtml(item.keyword)}</b><button data-add-keyword="${escapeHtml(item.keyword)}">추가</button></li>`).join("")}</ol>`;
  } catch (error) {
    keywordContent.innerHTML = `<div class="keywordState error"><b>인기검색어를 불러오지 못했습니다.</b><p>${escapeHtml(error.message || "네이버 데이터랩 응답을 확인할 수 없습니다.")}</p><button data-retry>다시 시도</button></div>`;
  }
}

input.addEventListener("input", runSearch);
clearButton.addEventListener("click", () => { input.value = ""; input.focus(); runSearch(); });
document.querySelectorAll("[data-query]").forEach((button) => button.addEventListener("click", () => { input.value = button.dataset.query; runSearch(); input.focus(); }));

list.addEventListener("click", async (event) => {
  const copyButton = event.target.closest("[data-copy-id]");
  if (copyButton) {
    await navigator.clipboard.writeText(copyButton.dataset.copyId);
    copyButton.textContent = "복사 완료";
    copyButton.classList.add("copied");
    setTimeout(() => { copyButton.textContent = "코드 복사"; copyButton.classList.remove("copied"); }, 1500);
    return;
  }
  const popularButton = event.target.closest("[data-keywords-id]");
  if (popularButton) openPopularKeywords(popularButton.dataset.keywordsId);
});

keywordContent.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-keyword]");
  if (addButton) {
    const keyword = addButton.dataset.addKeyword;
    if (!selectedKeywords.includes(keyword)) {
      selectedKeywords.push(keyword);
      saveSelectedKeywords();
    }
    addButton.textContent = "추가됨";
    addButton.disabled = true;
    return;
  }
  const retryButton = event.target.closest("[data-retry]");
  if (retryButton) fetchPopularKeywords();
});

periodYear.addEventListener("change", () => updateMonthOptions());
document.querySelector("#period-search").addEventListener("click", fetchPopularKeywords);

document.querySelector("#close-keywords").addEventListener("click", () => keywordDialog.close());
keywordDialog.addEventListener("click", (event) => { if (event.target === keywordDialog) keywordDialog.close(); });
workList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-index]");
  if (!button) return;
  selectedKeywords.splice(Number(button.dataset.removeIndex), 1);
  saveSelectedKeywords();
});
document.querySelector("#copy-work").addEventListener("click", async (event) => {
  if (!selectedKeywords.length) return;
  await navigator.clipboard.writeText(selectedKeywords.join("\n"));
  event.currentTarget.textContent = "전체 복사 완료";
  setTimeout(() => { event.currentTarget.textContent = "전체 복사"; }, 1500);
});
document.querySelector("#clear-work").addEventListener("click", () => { selectedKeywords = []; saveSelectedKeywords(); });

setupPeriodSelectors();
renderWorkList();
