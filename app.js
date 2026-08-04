const MAX_RESULTS = 100;
let categories = [];

const input = document.querySelector("#search");
const clearButton = document.querySelector("#clear");
const list = document.querySelector("#list");
const title = document.querySelector("#result-title");
const count = document.querySelector("#result-count");

fetch("categories.json")
  .then((response) => response.json())
  .then((data) => { categories = data; runSearch(); })
  .catch(() => { list.innerHTML = '<div class="empty"><b>데이터를 불러오지 못했어요.</b><p>잠시 후 다시 시도해 주세요.</p></div>'; });

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function runSearch() {
  const raw = input.value.trim();
  const query = raw.toLowerCase();
  clearButton.hidden = !raw;
  if (!query) {
    title.textContent = "카테고리를 검색해 주세요";
    count.hidden = true;
    list.innerHTML = '<div class="empty"><b>무엇을 판매하시나요?</b><p>상품과 가장 가까운 단어를 입력하면 전체 경로와 코드를 찾아드려요.</p></div>';
    return;
  }
  const matches = categories.filter((item) => item.path.toLowerCase().includes(query) || item.id.includes(query));
  title.textContent = `'${raw}' 검색 결과`;
  count.textContent = `${matches.length.toLocaleString()}개`;
  count.hidden = false;
  if (!matches.length) {
    list.innerHTML = '<div class="empty"><b>검색 결과가 없어요.</b><p>더 짧은 단어로 다시 검색해 보세요.</p></div>';
    return;
  }
  list.innerHTML = matches.slice(0, MAX_RESULTS).map((item, index) => {
    const parts = item.path.split(" > ");
    const name = escapeHtml(parts.at(-1));
    const path = escapeHtml(parts.slice(0, -1).join(" › ") || "최상위 카테고리");
    return `<article><span class="number">${String(index + 1).padStart(2, "0")}</span><div class="categoryInfo"><h2>${name}</h2><p>${path}</p></div><code>${item.id}</code><button class="copy" data-id="${item.id}">코드 복사</button></article>`;
  }).join("") + (matches.length > MAX_RESULTS ? `<div class="more">결과가 많아 상위 ${MAX_RESULTS}개만 표시합니다. 검색어를 더 구체적으로 입력해 주세요.</div>` : "");
}

input.addEventListener("input", runSearch);
clearButton.addEventListener("click", () => { input.value = ""; input.focus(); runSearch(); });
document.querySelectorAll("[data-query]").forEach((button) => button.addEventListener("click", () => { input.value = button.dataset.query; runSearch(); input.focus(); }));
list.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) return;
  await navigator.clipboard.writeText(button.dataset.id);
  button.textContent = "복사됨 ✓";
  button.classList.add("copied");
  setTimeout(() => { button.textContent = "코드 복사"; button.classList.remove("copied"); }, 1500);
});
