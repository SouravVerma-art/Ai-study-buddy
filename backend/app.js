const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

console.log("This port is working Properly.....");

const app = express();
app.use(cors());
app.use(express.json());
app.use(helmet());
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
  })
);

// API key guard
const requireApiKey = (req, res, next) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      error: "GEMINI_API_KEY is not set",
      message:
        "Please set your API key as an environment variable before using AI features. In development, create backend/.env and add: GEMINI_API_KEY=Enter your API key here",
    });
  }
  next();
};

// Helper to handle Gemini API errors with proper status codes
const handleGeminiError = (error, res) => {
  const errorMsg = error.message || "";

  // Detect rate limit errors (429)
  if (errorMsg.includes("429") ||
      errorMsg.includes("RATE_LIMIT_EXCEEDED") ||
      errorMsg.includes("Quota exceeded")) {
    console.error("Rate Limit Error:", errorMsg);
    return res.status(429).json({
      error: "Rate limit exceeded",
      message: "The AI service has reached its request limit. Please wait a minute before trying again.",
      details: "Consider switching to gemini-1.5-flash model or enabling billing in Google Cloud Console.",
      retryAfter: 60
    });
  }

  // Detect API key errors
  if (errorMsg.includes("API_KEY") || errorMsg.includes("401") || errorMsg.includes("403")) {
    console.error("API Key Error:", errorMsg);
    return res.status(401).json({
      error: "Authentication failed",
      message: "Invalid or expired API key. Please check your GEMINI_API_KEY in the .env file."
    });
  }

  // Generic error
  console.error("Gemini API Error:", errorMsg);
  return res.status(500).json({
    error: "AI service error",
    message: errorMsg || "An unexpected error occurred while processing your request."
  });
};

// Gemini setup - CHANGED TO FREE TIER MODEL
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash" // Correct model name for v1beta API
});

// Helper function to call Gemini with retry logic
const callGeminiWithRetry = async (prompt, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await model.generateContent(prompt);
      return result;
    } catch (error) {
      const errorMsg = error.message || "";

      // If it's a rate limit error and we have retries left, wait and retry
      if ((errorMsg.includes("429") || errorMsg.includes("RATE_LIMIT")) && i < maxRetries - 1) {
        const waitTime = Math.pow(2, i) * 1000; // Exponential backoff: 1s, 2s, 4s
        console.log(`⏳ Rate limited, waiting ${waitTime}ms before retry ${i + 1}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // If not a rate limit error or no retries left, throw the error
      throw error;
    }
  }
};

// Route: Ask AI
app.post("/ask", requireApiKey, async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || question.trim() === "") {
      return res.status(400).json({ error: "Question is required" });
    }

    const prompt = `You are a study buddy for a 6th grade student. Explain this in very simple words, using short sentences and friendly tone. If the question is complex, break it into steps: ${question}`;

    const result = await callGeminiWithRetry(prompt);
    res.json({ answer: result.response.text() });
  } catch (error) {
    return handleGeminiError(error, res);
  }
});

// Route: Generate Quiz
app.post("/generate-quiz", requireApiKey, async (req, res) => {
  try {
    const { topic, difficulty = "beginner", questionCount = 10 } = req.body;

    if (!topic || topic.trim() === "") {
      return res.status(400).json({ error: "Topic is required" });
    }

    const prompt = `Create a ${difficulty} level quiz about "${topic}" with ${questionCount} multiple choice questions.
    Format your response as JSON with this structure:
    {
      "quiz": [
        {
          "question": "Question text",
          "options": ["A", "B", "C", "D"],
          "correct": 0,
          "explanation": "Why this is correct"
        }
      ]
    }
    Keep it simple for 6th grade level.`;

    const result = await callGeminiWithRetry(prompt);
    const response = result.response.text();

    // Try to parse JSON from the response
    try {
      const cleanedResponse = response.replace(/```json|```/g, "").trim();
      const quizData = JSON.parse(cleanedResponse);
      res.json(quizData);
    } catch (parseError) {
      // If JSON parsing fails, return raw response
      res.json({ quiz: response });
    }
  } catch (error) {
    return handleGeminiError(error, res);
  }
});

// Route: Summarize Text
app.post("/summarize", requireApiKey, async (req, res) => {
  try {
    const { text, length = "medium" } = req.body;

    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "Text is required" });
    }

    let lengthInstruction;
    switch (length) {
      case "short":
        lengthInstruction = "in 2-3 short sentences";
        break;
      case "long":
        lengthInstruction = "in simple detailed paragraphs";
        break;
      default:
        lengthInstruction = "in 1 short paragraph";
        break;
    }

    const prompt = `Summarize the following text ${lengthInstruction} for a 6th grade student. Make it easy to understand and include a simple example if useful:\n${text}`;

    const result = await callGeminiWithRetry(prompt);
    res.json({ summary: result.response.text() });
  } catch (error) {
    return handleGeminiError(error, res);
  }
});

// Route: Generate Flashcards
app.post("/generate-flashcards", requireApiKey, async (req, res) => {
  try {
    const { topic, cardCount = 10 } = req.body;

    if (!topic || topic.trim() === "") {
      return res.status(400).json({ error: "Topic is required" });
    }

    const prompt = `Create ${cardCount} flashcards about "${topic}" for a 6th grade student.
    Format as JSON:
    {
      "flashcards": [
        {
          "front": "Question or term",
          "back": "Answer or definition",
          "hint": "Optional helpful hint"
        }
      ]
    }
    Make them educational, fun, and age-appropriate.`;

    const result = await callGeminiWithRetry(prompt);
    const response = result.response.text();

    try {
      const cleanedResponse = response.replace(/```json|```/g, "").trim();
      const flashcardData = JSON.parse(cleanedResponse);
      res.json(flashcardData);
    } catch (parseError) {
      res.json({ flashcards: response });
    }
  } catch (error) {
    return handleGeminiError(error, res);
  }
});

// Route: Explain Concept
app.post("/explain", requireApiKey, async (req, res) => {
  try {
    const { concept, context = "" } = req.body;

    if (!concept || concept.trim() === "") {
      return res.status(400).json({ error: "Concept is required" });
    }

    const prompt = `You are a friendly teacher. Explain "${concept}" to a 6th grade student in simple terms. ${
      context ? `Context: ${context}` : ""
    } Use examples, analogies, and simple language. Make it engaging and easy to understand.`;

    const result = await callGeminiWithRetry(prompt);
    res.json({ explanation: result.response.text() });
  } catch (error) {
    return handleGeminiError(error, res);
  }
});

// Route: Study Plan generator
app.post("/study-plan", requireApiKey, async (req, res) => {
  try {
    const { subjects = [], minutesPerDay = 60, days = 7, goal = "Improve understanding" } = req.body;

    if (subjects.length === 0) {
      return res.status(400).json({ error: "At least one subject is required" });
    }

    const prompt = `Create a ${days}-day simple study plan for a 6th grade student. They have ${minutesPerDay} minutes per day. Subjects: ${subjects.join(", ")}. Goal: ${goal}.
Return JSON like:
{
  "plan": [
    { "day": 1, "totalMinutes": 60, "sessions": [ { "subject": "Math", "minutes": 20, "activity": "Practice fractions" } ], "tips": ["..."] }
  ],
  "motivation": "one short friendly sentence"
}`;

    const result = await callGeminiWithRetry(prompt);
    const response = result.response.text();

    try {
      const cleaned = response.replace(/```json|```/g, "").trim();
      const data = JSON.parse(cleaned);
      res.json(data);
    } catch (e) {
      res.json({ plan: response });
    }
  } catch (error) {
    return handleGeminiError(error, res);
  }
});

// Route: Create quiz from notes
app.post("/notes-to-quiz", requireApiKey, async (req, res) => {
  try {
    const { notes = "", difficulty = "beginner", questionCount = 10 } = req.body;

    if (!notes || notes.trim() === "") {
      return res.status(400).json({ error: "Notes are required" });
    }

    const prompt = `From the following notes, create a ${difficulty} quiz with ${questionCount} multiple-choice questions (A-D). Keep it 6th-grade friendly. Return JSON {"quiz": [{"question":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."}]}.
Notes:\n${notes}`;

    const result = await callGeminiWithRetry(prompt);
    const response = result.response.text();

    try {
      const cleaned = response.replace(/```json|```/g, "").trim();
      const data = JSON.parse(cleaned);
      res.json(data);
    } catch (e) {
      res.json({ quiz: response });
    }
  } catch (error) {
    return handleGeminiError(error, res);
  }
});

// Route: Extract key points
app.post("/extract-key-points", requireApiKey, async (req, res) => {
  try {
    const { text = "" } = req.body;

    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "Text is required" });
    }

    const prompt = `Read the text and return JSON with key points (5-10 bullets in simple language), glossary (term + definition), and 3 practice questions. Keep it for 6th grade.
{
  "key_points": ["..."],
  "glossary": [{"term":"...","definition":"..."}],
  "practice_questions": ["..."]
}
Text:\n${text}`;

    const result = await callGeminiWithRetry(prompt);
    const response = result.response.text();

    try {
      const cleaned = response.replace(/```json|```/g, "").trim();
      const data = JSON.parse(cleaned);
      res.json(data);
    } catch (e) {
      res.json({ key_points: response });
    }
  } catch (error) {
    return handleGeminiError(error, res);
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "AI Study Buddy Backend is running!",
    model: "gemini-2.5-flash",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
    endpoints: [
      "POST /ask - Ask AI questions",
      "POST /generate-quiz - Generate quizzes",
      "POST /summarize - Summarize text",
      "POST /generate-flashcards - Create flashcards",
      "POST /explain - Explain concepts",
      "POST /study-plan - Generate a multi-day plan",
      "POST /notes-to-quiz - Quiz from pasted notes",
      "POST /extract-key-points - Key takeaways, glossary, practice",
    ],
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Using model: gemini-1.5-flash-latest`);
});