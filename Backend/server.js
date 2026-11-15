
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

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

// Analysis endpoint
app.post("/api/analyze", (req, res) => {

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

    const result = analyseContent(
        guidelines.trim(),
        content.trim()
    );

    res.json({
        status: "success",
        analysis: result
    });
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`VerifyAI server running on http://localhost:${PORT}`);
});
