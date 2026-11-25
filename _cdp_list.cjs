const http = require("http");
http.get("http://127.0.0.1:9222/json/list", (r) => {
  let d = "";
  r.on("data", (c) => (d += c));
  r.on("end", () => {
    try {
      const arr = JSON.parse(d);
      console.log("count:", arr.length);
      for (const x of arr) {
        console.log(x.type, x.title, x.url);
      }
    } catch (e) {
      console.log("RAW:", d.slice(0, 500));
    }
  });
});
