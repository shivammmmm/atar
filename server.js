import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import PDFParser from "pdf2json";
import { extractWithGemini } from "./geminiExtractor.js";
import mongoose from "mongoose";
import InsurancePolicy from "./models/InsurancePolicy.js";
import User from "./models/User.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "uploads");

dotenv.config(); // Loads .env - comment MONGODB_URI for local or whitelist Atlas IP
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// MongoDB connection
const mongoUri = "mongodb://localhost:27017/insurancepolicies"; // Local - set process.env.MONGODB_URI='' in .env or whitelist Atlas
const backendPublicUrl =
  process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`;
mongoose
  .connect(mongoUri)
  .then(() => {
    console.log("✅ MongoDB connected");

    // Create default admin if not exists
    User.findOne({ email: "admin@test.com" })
      .then((user) => {
        if (!user) {
          const newUser = new User({
            email: "admin@test.com",
            password: "password",
          });
          newUser
            .save()
            .then(() => console.log("✅ Default admin user created"));
        } else {
          console.log("ℹ️ Admin user exists");
        }
      })
      .catch((err) => console.error("Default user create error:", err.message));
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });

const JWT_SECRET = process.env.JWT_SECRET || "supersecretchangeinprod";

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access token missing" });
  }
  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

// Auth routes
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, user: { email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

const port = process.env.PORT || 5000;
const upload = multer({ dest: uploadsDir });

app.post("/api/convert", authMiddleware, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const pdfParser = new PDFParser(null, 1);

  pdfParser.on("pdfParser_dataReady", async (pdfData) => {
    try {
      const rawText = pdfParser.getRawTextContent();

      const extractedData = await extractWithGemini(rawText);

      const policyData = {
        ...extractedData,
        source_file: req.file.originalname || req.file.filename,
        original_file_url: `${backendPublicUrl}/uploads/${req.file.filename}`,
      };
      const savedPolicy = await InsurancePolicy.create(policyData);

      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        // Ignore unlink error, file can be cleaned later
      }
      res.json({
        ...extractedData,
        id: savedPolicy._id,
        saved: true,
      });
    } catch (error) {
      console.error("Convert route error:", error.message);
      res.status(500).json({
        error: error.message || "Gemini processing failed",
      });
    }
  });

  pdfParser.on("pdfParser_dataError", (errData) => {
    console.error("PDF parser error:", errData?.parserError);
    res.status(500).json({ error: "Failed to read PDF" });
  });

  pdfParser.loadPDF(req.file.path);
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/api/policies", authMiddleware, async (req, res) => {
  try {
    const policies = await InsurancePolicy.find()
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(policies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/policies/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await InsurancePolicy.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: "Policy not found" });
    res.json({ message: "Policy deleted", id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {});
