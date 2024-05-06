import fs from "fs";
import https from "https";
import path from "path";

const jsonPath = path.resolve(__dirname, "./symbol-map.json");
const symbolMapData = fs.readFileSync(jsonPath, "utf-8");
const symbolMap = JSON.parse(symbolMapData);

const words: string[] = Object.entries(symbolMap).map(([key, value]) => value as string);

words.forEach((word) => {
  fetchAudio(word, "uk");
  fetchAudio(word, "us");
});

function fetchAudio(word: string, type: "uk" | "us") {
  return new Promise((resolve, reject) => {
    const url = `https://dictionary.cambridge.org/media/english/${type}_phonetic_ogg/${type}_phonetics_sound_${word}_2023feb.ogg`;
    https
      .get(url, (response: any) => {
        const chunks: any[] = [];

        response.on("data", (chunk: any) => {
          chunks.push(chunk);
        });

        response.on("end", () => {
          if (response.statusCode === 200) {
            const audioData = Buffer.concat(chunks);
            fs.mkdirSync(path.resolve(__dirname, "../../data/audio"), { recursive: true });
            fs.writeFile(
              path.resolve(__dirname, `../../data/audio/${word}_${type}.ogg`),
              audioData,
              (error: any) => {
                if (error) {
                  reject(error);
                } else {
                  resolve(true);
                }
              },
            );
          }
        });
      })
      .on("error", (error: any) => {
        reject(error);
      });
  });
}
