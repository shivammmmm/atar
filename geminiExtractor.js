import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  EMPTY_INSURANCE_RECORD,
  PDF_EXTRACTABLE_COLUMNS,
} from "./shared/insuranceColumns.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_GEMINI_FALLBACK_MODELS = [
  DEFAULT_GEMINI_MODEL,
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
];

dotenv.config({ path: path.join(__dirname, ".env") });

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const geminiModelName =
  process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

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

function buildGeminiModelList() {
  return [
    ...new Set([geminiModelName, ...DEFAULT_GEMINI_FALLBACK_MODELS].filter(Boolean)),
  ];
}

function getGeminiErrorMessage(error) {
  if (error?.message) {
    return String(error.message).trim();
  }

  return String(error);
}

function classifyGeminiError(error) {
  const status = Number(error?.status);
  const message = getGeminiErrorMessage(error).toLowerCase();

  if (
    status === 404 ||
    message.includes("not found") ||
    message.includes("not supported for generatecontent")
  ) {
    return "model";
  }

  if (
    status === 401 ||
    status === 403 ||
    message.includes("api key not valid") ||
    message.includes("permission denied") ||
    message.includes("forbidden") ||
    message.includes("access not configured")
  ) {
    return "auth";
  }

  if (
    status === 429 ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("resource has been exhausted")
  ) {
    return "quota";
  }

  if (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("enotfound")
  ) {
    return "network";
  }

  return "other";
}

function buildGeminiFailureMessage(models, failures) {
  if (!failures.length) {
    return `All Gemini model attempts failed before an error could be captured. Requested GEMINI_MODEL=${geminiModelName}. Models tried: ${models.join(", ")}.`;
  }

  const summary = failures
    .map(({ modelName, message }) => `${modelName}: ${message}`)
    .join(" | ");
  const failureKinds = new Set(failures.map(({ type }) => type));

  if (failureKinds.size === 1 && failureKinds.has("model")) {
    return `All Gemini model attempts used unsupported or unavailable model IDs. Requested GEMINI_MODEL=${geminiModelName}. Models tried: ${models.join(", ")}. Failures: ${summary}.`;
  }

  if (failureKinds.has("auth")) {
    return `Gemini API authentication or access failed. Requested GEMINI_MODEL=${geminiModelName}. Models tried: ${models.join(", ")}. Failures: ${summary}. Check GEMINI_API_KEY or GOOGLE_API_KEY and confirm the Gemini API is enabled for that project.`;
  }

  if (failureKinds.has("quota")) {
    return `Gemini API quota or rate limits blocked extraction. Requested GEMINI_MODEL=${geminiModelName}. Models tried: ${models.join(", ")}. Failures: ${summary}.`;
  }

  if (failureKinds.has("network")) {
    return `Gemini API network access failed. Requested GEMINI_MODEL=${geminiModelName}. Models tried: ${models.join(", ")}. Failures: ${summary}.`;
  }

  return `All Gemini model attempts failed. Requested GEMINI_MODEL=${geminiModelName}. Models tried: ${models.join(", ")}. Failures: ${summary}.`;
}

export const extractWithGemini = async (text) => {
  const models = buildGeminiModelList();
  const failures = [];

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
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

      console.log(`Gemini extraction successful with model: ${modelName}`);
      return normalizeExtractedData(parsedData);
    } catch (error) {
      const failure = {
        modelName,
        message: getGeminiErrorMessage(error),
        type: classifyGeminiError(error),
      };

      failures.push(failure);
      console.warn(`Gemini model ${modelName} failed: ${failure.message}`);

      if (
        failure.type === "auth" ||
        failure.type === "quota" ||
        failure.type === "network"
      ) {
        break;
      }
    }
  }

  throw new Error(buildGeminiFailureMessage(models, failures));
};
