// src/utils/analyzeImage.ts
import { GoogleGenAI, Modality } from "@google/genai";
import * as fs from "node:fs";

const GEMENI_API_KEY = process.env.GEMENI_API_KEY;

if (!GEMENI_API_KEY) {
  console.error("❌ GEMENI_API_KEY environment variable is not set!");
  process.exit(1);
}

/**
 * Analyze an image using Google GenAI.
 * @param imagePath - Path to the image file.
 * @param question - The question or prompt to ask about the image.
 * @param model - (Optional) Model name to use. Default: "gemma-3-4b-it".
 * @returns The AI's text response.
 */

export async function analyzeImage(
  imagePath: string,
  question: string,
  // model = "gemma-3-4b-it"
  model = "gemma-3-12b-it"

): Promise<string | null> {
  const startTime = Date.now();
  const ai = new GoogleGenAI({ apiKey: GEMENI_API_KEY });

  const prompt = `
  Context:
  You are an AI assistant running on smart glasses. The user says a wake word, then speaks a query. Below, you have access to the query and potentially have access to a POV picture from their smart glasses taken at the time the query was made.
  
  Answer in full, clear sentences, using 12 words or fewer.

  Query:
  "${question}"
  `;

  console.log(`⏳ Analyzing image with prompt: "${question}"\n`);

  const promptStartTime = Date.now();
  const imageData = fs.readFileSync(imagePath).toString("base64");

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageData,
            },
          },
        ],
      },
    ],
  });

  const promptEndTime = Date.now();

  let textResponse: string | null = null;

  if (
    response.candidates &&
    response.candidates[0]?.content?.parts
  ) {
    for (const part of response.candidates[0].content.parts) {
      if (part.text) {
        textResponse = part.text;
        console.log("Text response:", part.text);
      } else if (part.inlineData) {
        const imgData = part.inlineData.data;
        if (typeof imgData === "string") {
          const buffer = Buffer.from(imgData, "base64");
          fs.writeFileSync("gemini-native-image.png", buffer);
          console.log("✓ Image saved as gemini-native-image.png");
          console.log(`✓ Image size: ${Math.round(buffer.length / 1024)}KB`);
        }
      }
    }
  } else {
    console.error("Response does not contain expected candidates or content.");
  }

  const totalTime = promptEndTime - startTime;
  const llmTime = promptEndTime - promptStartTime;

  console.log(`\n⏱️  TIMING RESULTS:`);
  console.log(`   • LLM processing: ${llmTime}ms`);
  console.log(`   • Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);

  return textResponse;
}
