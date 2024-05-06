import fs from "fs";
import path from "path";

const jsonFilePath = path.resolve(__dirname, "./symbol-map.json");
const jsonData = fs.readFileSync(jsonFilePath, "utf-8");
const jsonObject = JSON.parse(jsonData);

const symbols = Object.keys(jsonObject);

const newData = {
  single: getGroup(symbols.filter((symbol) => symbol.length === 1)),
  double: getGroup(symbols.filter((symbol) => symbol.length === 2)),
  triple: getGroup(symbols.filter((symbol) => symbol.length === 3)),
};

function getGroup(symbols: string[]) {
  const result: Record<string, string> = {};
  symbols.forEach((symbol) => {
    result[symbol] = jsonObject[symbol];
  });
  return result;
}

fs.writeFileSync(
  path.resolve(__dirname, "./symbol-map-group.json"),
  JSON.stringify(newData, null, 2),
);
