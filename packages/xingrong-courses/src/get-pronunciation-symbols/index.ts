import fs from "fs";
import https from "https";
import path from "path";

import { load } from "cheerio";

const url = "https://dictionary.cambridge.org/help/phonetics.html";

https.get(url, (response: any) => {
  const chunks: any[] = [];

  response.on("data", (chunk: any) => {
    chunks.push(chunk);
  });

  response.on("end", () => {
    const htmlContent = Buffer.concat(chunks).toString();
    const $ = load(htmlContent);
    const jsonObject: Record<string, string> = {};

    function getData(element: any) {
      let symbol = $(element).find("td").eq(0).text();
      let example = $(element).find("td").eq(2).text();
      symbol = symbol.replace(/\s/g, "");
      example = example.replace(/\s/g, "");
      jsonObject[symbol] = example;
    }

    $('table[summary="Vowels"] tbody tr').each((index, element) => {
      getData(element);
    });

    $('table[summary="Consonants"] tbody tr').each((index, element) => {
      getData(element);
    });

    $("amp-accordion")
      .eq(2)
      .find("table")
      .slice(1, 4)
      .find("tbody tr")
      .each((index, element) => {
        getData(element);
      });

    fs.writeFileSync(
      path.resolve(__dirname, "./symbol-map.json"),
      JSON.stringify(jsonObject, null, 2),
    );
  });
});
