import { fetchText } from "./src/util/http.js";
const feeds = [
 ["FMT-nation","https://www.freemalaysiatoday.com/category/nation/feed/"],
 ["NST","https://www.nst.com.my/feed"],
 ["Bernama","https://www.bernama.com/en/rssfeed.php?type=news"],
 ["Sinar","https://www.sinarharian.com.my/rss.xml"],
 ["TheStar-alt","https://www.thestar.com.my/rss/news/nation"],
 ["Utusan","https://www.utusan.com.my/feed"],
];
for (const [n,u] of feeds) {
  try { const xml = await fetchText(u); const items=(xml.match(/<item[\s\S]*?<\/item>/gi)??[]).length; console.log(n, "OK items", items); }
  catch(e){ console.log(n, "ERR", e.message.slice(0,50)); }
}
