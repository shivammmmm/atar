import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  EMPTY_INSURANCE_RECORD,
  PDF_EXTRACTABLE_COLUMNS,
} from "../shared/insuranceColumns.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const geminiModelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!apiKey) {
  throw new Error("Missing Gemini API key. Set GEMINI_API_KEY or GOOGLE_API_KEY.");
}

const genAI = new GoogleGenerativeAI(apiKey);

const extractionSchema = {
  type: SchemaType.OBJECT,
  properties: Object.fromEntries(
    PDF_EXTRACTABLE_COLUMNS.map(({ key }) => [
      key,
      { type: SchemaType.STRING, nullable: true },
    ]),
  ),
  required: PDF_EXTRACTABLE_COLUMNS.map(({ key }) => key),
};

const extractionGuide = PDF_EXTRACTABLE_COLUMNS.map(
  ({ key, header, promptHint }) => `- ${key} (${header}): ${promptHint}`,
).join("\n");

function normalizeValue(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalizedValue = String(value).trim();
  return normalizedValue === "" ? null : normalizedValue;
}

function normalizeExtractedData(rawData) {
  const normalizedRecord = { ...EMPTY_INSURANCE_RECORD };

  for (const { key } of PDF_EXTRACTABLE_COLUMNS) {
    normalizedRecord[key] = normalizeValue(rawData?.[key]);
  }

  return normalizedRecord;
}

export const extractWithGemini = async (text) => {
  try {
    const model = genAI.getGenerativeModel({
      model: geminiModelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: extractionSchema,
      },
    });

    const prompt = `
      Extract insurance data from the following PDF text and return only a valid JSON object.
      Use every key exactly as listed below.
      If the PDF contains a value for a column, fill it even if the label wording is slightly different.
      If a value is genuinely not present anywhere in the PDF text, return null for that key.
      Do not invent values.
      Keep policy numbers, registration numbers, engine numbers, and chassis numbers exactly as written.
      Return dates as text in the clearest date form found in the PDF.
      Return premium, amount, and percentage values as plain text without extra commentary.

      Fields:
      ${extractionGuide}

      PDF text:
      ${text}
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonText = response.text().trim();
    const parsedData = JSON.parse(jsonText);

    return normalizeExtractedData(parsedData);
  } catch (error) {
    throw new Error(
      `Gemini processing failed for model "${geminiModelName}": ${error.message}`,
    );
  }
};
