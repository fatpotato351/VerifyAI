
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import multer from "multer";
dotenv.config();
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});
const app = express();

app.use(cors());
app.use(express.json());
// Logo image upload configuration
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 2
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            "image/png",
            "image/jpeg",
            "image/webp"
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only PNG, JPG, and WEBP images are allowed."));
        }
    }
});
// Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "success",
        message: "VerifyAI server is healthy!"
    });
});

// Escape special characters for regular expressions
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Generate suggested corrections
function generateCorrection(content, issues) {
    let revised = content;

    for (const issue of issues) {

        // Replace restricted or forbidden phrases
        if (
            (issue.title === "Brand Guideline Contradiction" ||
             issue.title === "Forbidden Phrase Detected") &&
            issue.matchedPhrase
        ) {
            const pattern = new RegExp(
                escapeRegExp(issue.matchedPhrase),
                "gi"
            );

            revised = revised.replace(
                pattern,
                "[replace with approved wording]"
            );
        }

        // Replace the entire sentence containing an exaggerated claim
        if (
            issue.title === "Potentially Exaggerated Claim" &&
            issue.matchedPhrase
        ) {
            const pattern = new RegExp(
                escapeRegExp(issue.matchedPhrase),
                "i"
            );

            const match = pattern.exec(revised);

            if (match) {
                const before = revised.slice(0, match.index);

                const sentenceStart = Math.max(
                    before.lastIndexOf("."),
                    before.lastIndexOf("!"),
                    before.lastIndexOf("?")
                ) + 1;

                const afterIndex = match.index + match[0].length;
                const remainingText = revised.slice(afterIndex);

                const ending = remainingText.match(/[.!?](?=\s|$)/);

                const sentenceEnd = ending
                    ? afterIndex + ending.index + 1
                    : revised.length;

                const leadingSpace =
                    revised.slice(sentenceStart).match(/^\s*/)?.[0] || "";

                revised =
                    revised.slice(0, sentenceStart) +
                    leadingSpace +
                    "[Rewrite this sentence using verified, evidence-supported wording.]" +
                    revised.slice(sentenceEnd);
            }
        }

        // Correct tone inconsistencies
        if (issue.title === "Tone Inconsistency") {
            revised = revised.replace(/\bbro,?\s*/gi, "");
            revised = revised.replace(/\bgonna\b/gi, "going to");
            revised = revised.replace(/\bwanna\b/gi, "want to");
            revised = revised.replace(/\blol\b/gi, "");
            revised = revised.replace(/\bhereby\b/gi, "are excited to");
            revised = revised.replace(/\baforementioned\b/gi, "new");
            revised = revised.replace(/\bpursuant to\b/gi, "as part of");
        }

        // Correct excessive punctuation
        if (issue.title === "Excessive Punctuation") {
            revised = revised.replace(/([!?]){2,}/g, "$1");
            revised = revised.replace(/\s+([!?])/g, "$1");
        }
    }

    return revised
        .replace(/\s+([,.!?])/g, "$1")
        .replace(/\s{2,}/g, " ")
        .trim();
}

// Main content analysis engine
function analyseContent(guidelines, content) {

    const issues = [];

    function addIssue(
        severity,
        title,
        explanation,
        suggestion,
        matchedPhrase = null
    ) {
        issues.push({
            severity,
            title,
            explanation,
            suggestion,
            ...(matchedPhrase ? { matchedPhrase } : {})
        });
    }

    const cleanContent = content.toLowerCase();

    
// RULE 1: Detect brand guideline contradictions
const restrictionPatterns = [
    /(?:doesn't have|does not have|doesn't contain|does not contain|must not have|must not contain|must not include|must not use|no)\s+(?:any\s+)?([^.!?;\n]+)/gi
];

const detectedRestrictions = new Set();

for (const pattern of restrictionPatterns) {
    for (const match of guidelines.matchAll(pattern)) {

        const restrictedPhrases = match[1]
            .replace(/["“”'‘’]/g, "")
            .replace(/[.,]+$/, "")
            .split(/\s+(?:and|or)\s+/i)
            .map(phrase => phrase.trim())
            .filter(phrase => phrase.length > 2);

        for (const restrictedPhrase of restrictedPhrases) {
            const normalizedPhrase = restrictedPhrase.toLowerCase();

            if (
                !detectedRestrictions.has(normalizedPhrase) &&
                cleanContent.includes(normalizedPhrase)
            ) {
                detectedRestrictions.add(normalizedPhrase);

                addIssue(
                    "critical",
                    "Brand Guideline Contradiction",
                    `Your guidelines restrict "${restrictedPhrase}", but this phrase appears in the submitted content.`,
                    "Remove the restricted claim or replace it with verified, brand-approved information.",
                    restrictedPhrase
                );
            }
        }
    }
}


    // RULE 2: Detect explicitly forbidden phrases
    const quotedForbiddenPhrase =
        /(?:avoid|do not use|don't use|never use)\s+(?:the\s+)?(?:phrase\s+)?["“'‘]([^"”'’]+)["”'’]/gi;

    const detectedForbiddenPhrases = new Set();

    for (const match of guidelines.matchAll(quotedForbiddenPhrase)) {

        const phrase = match[1].trim();
        const normalizedPhrase = phrase.toLowerCase();

        if (
            phrase.length > 2 &&
            !detectedForbiddenPhrases.has(normalizedPhrase) &&
            cleanContent.includes(normalizedPhrase)
        ) {
            detectedForbiddenPhrases.add(normalizedPhrase);

            addIssue(
                "warning",
                "Forbidden Phrase Detected",
                `Your brand guidelines ask you to avoid "${phrase}", but it appears in the submitted content.`,
                `Remove or replace "${phrase}" with brand-approved wording.`,
                phrase
            );
        }
    }

    
    // RULE 3: Detect potentially exaggerated or unsupported claims

    const claimPatterns = [
        {
            pattern: /\b100\s*%\s*(?:effective|guaranteed|safe|pure)\b/gi,
            description: "Absolute performance or safety claim"
        },
        { 
            pattern: /\bguaranteed\b(?!\s+to\b)/gi, 
            description: "Guarantee-based claim" 
        },
        {
            pattern: /\b(?:the )?best(?: ever)?\b/gi,
            description: "Superiority claim"
        },
        {
            pattern: /\bnumber one\b|#1\b/gi,
            description: "Ranking claim"
        },
        {
            pattern: /\bzero risk\b|\brisk[- ]free\b/gi,
            description: "Absolute risk claim"
        },
        {
            pattern: /\b(?:scientifically|clinically|independently)\s+proven\b/gi,
            description: "Evidence-based claim requiring verification"
        },
        { 
            pattern: /\b(?:guaranteed|proven|shown|demonstrated)\s+to\s+[^.!?]+/gi, 
            description: "Claim about a promised or demonstrated outcome" 
        },
        {
            pattern: /\b(?:will always|always delivers|never fails)\b/gi,
            description: "Absolute outcome claim"
        }
    ];

    
const claimMatches = [];

for (const claimRule of claimPatterns) {
    for (const match of content.matchAll(claimRule.pattern)) {
        claimMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            description: claimRule.description
        });
    }
}

claimMatches.sort((a, b) => a.start - b.start);

const mergedClaims = [];

for (const current of claimMatches) {
    const previous = mergedClaims[mergedClaims.length - 1];

    if (previous && current.start < previous.end) {
        previous.end = Math.max(previous.end, current.end);

        if (!previous.descriptions.includes(current.description)) {
            previous.descriptions.push(current.description);
        }
    } else {
        mergedClaims.push({
            start: current.start,
            end: current.end,
            descriptions: [current.description]
        });
    }
}

for (const claim of mergedClaims) {
    const matchedClaim = content.slice(claim.start, claim.end).trim();

    addIssue(
        "warning",
        "Potentially Exaggerated Claim",
        `The claim "${matchedClaim}" may require reliable supporting evidence before publication. Category: ${claim.descriptions.join(", ")}.`,
        "Provide credible evidence for this claim or use more measured wording.",
        matchedClaim
    );
}



    // RULE 4: Check brand-specific tone consistency
    const formalTone =
        /\b(professional|formal|corporate|sophisticated|authoritative|serious|elegant|luxurious|premium)\b/i.test(guidelines);

    const casualTone =
        /\b(casual|friendly|conversational|youthful|informal|playful|fun|witty|relaxed|approachable)\b/i.test(guidelines);

    const informalWords =
        /\b(lol|gonna|wanna|bro|dude|yolo|omg)\b/i;

    const overlyFormalWords =
        /\b(hereby|aforementioned|pursuant|endeavour)\b/i;

    if (formalTone && informalWords.test(content)) {

        addIssue(
            "warning",
            "Tone Inconsistency",
            "Casual expressions were detected, while your guidelines request a formal or sophisticated tone.",
            "Replace casual expressions with language that matches your brand personality."
        );

    } else if (casualTone && overlyFormalWords.test(content)) {

        addIssue(
            "warning",
            "Tone Inconsistency",
            "Overly formal expressions were detected, while your guidelines request a casual and conversational tone.",
            "Use simpler, friendlier language that matches your brand personality."
        );
    }

    // RULE 5: Detect excessive punctuation
    if (/[!?]{2,}/.test(content)) {

        addIssue(
            "suggestion",
            "Excessive Punctuation",
            "Repeated exclamation or question marks may make the content appear overly promotional.",
            "Use punctuation more selectively for a cleaner presentation."
        );
    }

    // Calculate compliance score
    const deductions = {
        critical: 30,
        warning: 15,
        suggestion: 5
    };

    let score = 100;

    for (const issue of issues) {
        score -= deductions[issue.severity];
    }

    score = Math.max(0, score);

    const status =
        issues.some(i => i.severity === "critical")
            ? "High Risk"
            : issues.some(i => i.severity === "warning")
            ? "Needs Review"
            : "Good";

    return {
        score,
        status,
        correctedContent: generateCorrection(content, issues),
        totalIssues: issues.length,
        issues,
        message: issues.length === 0
            ? "No issues were detected by the current rule set."
            : "Potential compliance issues were detected. Human review is recommended."
    };
}
// Gemini AI analysis engine
async function analyseWithGemini(guidelines, content) {

    const response = await ai.models.generateContent({

        model: "gemini-3.1-flash-lite",

        contents: `

You are VerifyAI, a strict brand compliance analyzer.

Your PRIMARY responsibility is to evaluate submitted content against the exact brand guidelines supplied by the user.

BRAND GUIDELINES:
${guidelines}

SUBMITTED CONTENT:
${content}

ANALYSIS PRIORITIES:

1. EXPLICIT BRAND RULES — HIGHEST PRIORITY
- Treat explicit brand instructions as mandatory requirements.
- Flag content that directly violates a stated restriction, requirement, prohibited phrase, formatting rule or communication instruction.
- Never ignore an explicit rule because the content might seem acceptable in another context.
- If a guideline explicitly prohibits something, its prohibition takes priority.

2. BRAND TONE AND PERSONALITY
- Evaluate whether the content matches the tone, personality, audience and positioning described in the guidelines.
- Consider the meaning and context of the complete sentence rather than judging isolated words.
- Do not flag wording merely because it is informal, promotional or unusual unless it conflicts with the supplied guidelines.

3. CLAIMS AND ACCURACY
- Flag potentially exaggerated, misleading or unsupported claims when relevant.
- Do not automatically declare a claim false without evidence.
- Distinguish between a claim requiring verification and a confirmed guideline violation.

4. STRICT EVIDENCE FROM GUIDELINES
- Do not invent brand rules or restrictions.
- Do not assume a brand prefers a particular tone unless its guidelines support that interpretation.
- Whenever possible, explain which specific guideline supports the finding.
- If an issue is not directly covered by the guidelines, clearly distinguish it as a general recommendation rather than an explicit violation.

5. ISSUE QUALITY
- Report genuine and relevant issues only.
- Avoid reporting the same underlying violation multiple times.
- Give a clear explanation and an actionable recommendation.
- Use these severity levels:
  - critical
  - warning
  - suggestion

Return an empty issues array if no issues are found.

`,

        config: {

            responseMimeType: "application/json",

            responseSchema: {
                type: Type.OBJECT,

                properties: {
                    issues: {
                        type: Type.ARRAY,

                        items: {
                            type: Type.OBJECT,

                            properties: {
                                severity: {
                                    type: Type.STRING,
                                    enum: ["critical", "warning", "suggestion"]
                                },

                                title: {
                                    type: Type.STRING
                                },

                                explanation: {
                                    type: Type.STRING
                                },

                                suggestion: {
                                    type: Type.STRING
                                },

                                matchedPhrase: {
                                    type: Type.STRING
                                }
                            },

                            required: [
                                "severity",
                                "title",
                                "explanation",
                                "suggestion",
                                "matchedPhrase"
                            ]
                        }
                    }
                },

                required: ["issues"]
            }
        }
    });

    const result = JSON.parse(response.text);

    return result.issues;
}

// Generate complete AI-powered content corrections
async function generateAiCorrection(guidelines, content, issues) {

    try {
        const response = await ai.models.generateContent({

            model: "gemini-3.1-flash-lite",

            contents: `
You are VerifyAI, an expert brand-compliance editor.

Rewrite the ENTIRE submitted content using the supplied brand guidelines and detected issues.

BRAND GUIDELINES:
${guidelines}

ORIGINAL CONTENT:
${content}

DETECTED ISSUES:
${JSON.stringify(issues, null, 2)}

INSTRUCTIONS:
1. Return the complete corrected content, not just individual suggestions.
2. Fix all genuine issues identified in the findings.
3. Preserve the original meaning, important information and intended message.
4. Match the brand's tone, personality and communication style.
5. Do not introduce new claims, facts, statistics or promises.
6. Do not invent evidence to support questionable claims. Use cautious, appropriately qualified wording where necessary.
7. Avoid unnecessary rewriting of sentences that are already compliant.
8. Never use placeholders such as [insert text] or [replace wording].
9. If no issues need correction, return the original content unchanged.

Return ONLY the complete revised content.
Do not include explanations, headings or commentary.
`,

            config: {
                responseMimeType: "text/plain"
            }
        });

        const correctedContent = response.text?.trim();

        if (!correctedContent) {
            throw new Error("AI returned an empty correction.");
        }

        return correctedContent;

    } catch (error) {
        console.error("AI correction error:", error);

        // Keep the original content available if AI correction fails
        return content;
    }
}

// Analysis endpoint
app.post("/api/analyze", async (req, res) => {

    const { guidelines, content } = req.body;

    if (
        typeof guidelines !== "string" ||
        typeof content !== "string" ||
        !guidelines.trim() ||
        !content.trim()
    ) {
        return res.status(400).json({
            status: "error",
            message: "Please provide both brand guidelines and content."
        });
    }

    try {

        // Run existing rule-based analysis
        const result = analyseContent(
            guidelines.trim(),
            content.trim()
        );

        // Run Gemini AI analysis
        const aiIssues = await analyseWithGemini(
            guidelines.trim(),
            content.trim()
        );

        
// Combine both sets of findings and remove duplicates
const combinedIssues = [...result.issues];

function getIssueCategory(title) {
    const normalized = title.toLowerCase();

    if (
        normalized.includes("forbidden") ||
        normalized.includes("prohibited") ||
        normalized.includes("guideline contradiction")
    ) return "brand-restriction";

    if (
        normalized.includes("exaggerated") ||
        normalized.includes("claim")
    ) return "exaggerated-claim";

    if (normalized.includes("punctuation")) {
        return "punctuation";
    }

    if (normalized.includes("tone")) {
        return "tone";
    }

    return normalized;
}

const severityRank = {
    critical: 3,
    warning: 2,
    suggestion: 1
};

for (const aiIssue of aiIssues) {

    const aiCategory = getIssueCategory(aiIssue.title);
    const aiPhrase = (aiIssue.matchedPhrase || "")
        .trim()
        .toLowerCase();

    const duplicate = combinedIssues.find(issue => {

        const sameCategory =
            getIssueCategory(issue.title) === aiCategory;

        const existingPhrase = (issue.matchedPhrase || "")
            .trim()
            .toLowerCase();

        if (aiPhrase && existingPhrase) {
            return sameCategory && aiPhrase === existingPhrase;
        }

        return (
            sameCategory &&
            issue.title.toLowerCase() === aiIssue.title.toLowerCase()
        );
    });

    if (duplicate) {

        // Keep the more serious severity
        if (
            (severityRank[aiIssue.severity] || 0) >
            (severityRank[duplicate.severity] || 0)
        ) {
            duplicate.severity = aiIssue.severity;
        }

    } else {
        combinedIssues.push(aiIssue);
    }
}


        // Recalculate compliance score
        const deductions = {
            critical: 30,
            warning: 15,
            suggestion: 5
        };

        let score = 100;

        for (const issue of combinedIssues) {
            score -= deductions[issue.severity] || 0;
        }

        score = Math.max(0, score);

        const status =
            combinedIssues.some(i => i.severity === "critical")
                ? "High Risk"
                : combinedIssues.some(i => i.severity === "warning")
                ? "Needs Review"
                : "Good";

        // Update existing analysis result
        result.score = score;
        result.status = status;
        result.issues = combinedIssues;
        result.totalIssues = combinedIssues.length;
        // Generate complete AI-powered corrections
        result.correctedContent = combinedIssues.length > 0
         ? await generateAiCorrection(
             guidelines.trim(),
             content.trim(),
             combinedIssues
         )
         : content.trim();
        result.message = combinedIssues.length === 0
            ? "No issues were detected by the current analysis."
            : "Potential compliance issues were detected. Human review is recommended.";

        res.json({
            status: "success",
            analysis: result
        });

    } catch (error) {

        console.error("VerifyAI analysis error:", error);

        res.status(500).json({
            status: "error",
            message: "AI analysis is temporarily unavailable. Please try again."
        });
    }
});

// AI-powered brand logo comparison
app.post(
    "/api/compare-logos",
    upload.fields([
        { name: "referenceLogo", maxCount: 1 },
        { name: "submittedLogo", maxCount: 1 }
    ]),
    async (req, res) => {

        try {
            const referenceLogo = req.files?.referenceLogo?.[0];
            const submittedLogo = req.files?.submittedLogo?.[0];

            if (!referenceLogo || !submittedLogo) {
                return res.status(400).json({
                    status: "error",
                    message: "Please upload both reference and submitted logos."
                });
            }

            const response = await ai.models.generateContent({
                model: "gemini-3.1-flash-lite",

                contents: [
                    {
                        text: `
You are VerifyAI, a professional brand identity comparison assistant.

Compare the two uploaded logos.

IMAGE 1: Official reference brand logo.
IMAGE 2: Logo submitted for verification.

Evaluate:
1. Colour consistency.
2. Typography and font style.
3. Symbols and visual elements.
4. Layout and proportions.
5. Overall visual consistency with the reference.

Return an honest assessment. Do not assume differences are violations.
Do not claim that the logos are identical or legally authentic.

Provide:
- A similarity score from 0 to 100.
- An overall verdict.
- A list of specific visual differences.
- Recommendations for improvement.

Return only valid JSON.
`
                    },
                    {
                        inlineData: {
                            mimeType: referenceLogo.mimetype,
                            data: referenceLogo.buffer.toString("base64")
                        }
                    },
                    {
                        inlineData: {
                            mimeType: submittedLogo.mimetype,
                            data: submittedLogo.buffer.toString("base64")
                        }
                    }
                ],

                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            similarityScore: {
                                type: Type.INTEGER
                            },
                            verdict: {
                                type: Type.STRING
                            },
                            differences: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.STRING
                                }
                            },
                            recommendations: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.STRING
                                }
                            }
                        },
                        required: [
                            "similarityScore",
                            "verdict",
                            "differences",
                            "recommendations"
                        ]
                    }
                }
            });

            const comparison = JSON.parse(response.text);

            res.json({
                status: "success",
                comparison
            });

        } catch (error) {
            console.error("Logo comparison error:", error);

            res.status(500).json({
                status: "error",
                message: "Logo comparison is temporarily unavailable. Please try again."
            });
        }
    }
);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`VerifyAI server running on port ${PORT}`);
});