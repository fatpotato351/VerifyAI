
const analyseBtn = document.getElementById("analyseBtn");

analyseBtn.addEventListener("click", async function () {

    const guidelines = document.getElementById("guidelines").value.trim();
    const content = document.getElementById("content").value.trim();
    const results = document.getElementById("results");

    if (!guidelines || !content) {
        results.textContent = "Please fill in both fields first!";
        return;
    }

    analyseBtn.disabled = true;
    analyseBtn.textContent = "Analysing...";
    results.textContent = "VerifyAI is analysing your content...";

    try {

        const response = await fetch("https://verifyai-backend-c4kr.onrender.com/api/analyze", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                guidelines: guidelines,
                content: content
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Analysis failed.");
        }

        const analysis = data.analysis;

        results.replaceChildren();

        // COMPLIANCE SCORE
        const heading = document.createElement("h3");
        heading.textContent = "Compliance Score: " + analysis.score + "/100";
        results.appendChild(heading);

        // STATUS
        const status = document.createElement("p");
        status.textContent = "Status: " + analysis.status;
        results.appendChild(status);

        // ISSUE COUNT
        const count = document.createElement("p");
        count.textContent = "Issues detected: " + analysis.totalIssues;
        results.appendChild(count);

        // ANALYSIS MESSAGE
        const message = document.createElement("p");
        message.textContent = analysis.message;
        results.appendChild(message);

        // DISPLAY DETECTED ISSUES
        analysis.issues.forEach(issue => {

            const card = document.createElement("div");
            card.className = "issue-card";

            const title = document.createElement("h4");
            title.textContent = issue.title;

            const severity = document.createElement("p");
            severity.textContent = "Severity: " + issue.severity;

            const explanation = document.createElement("p");
            explanation.textContent = issue.explanation;

            const suggestion = document.createElement("p");
            suggestion.textContent = "Suggestion: " + issue.suggestion;

            card.append(title, severity, explanation, suggestion);
            results.appendChild(card);

        });

        // SMART CORRECTION SECTION
        const correctionSection = document.createElement("div");
        correctionSection.className = "correction-section";

        const correctionHeading = document.createElement("h3");
        correctionHeading.textContent = "Suggested Correction";

        const correctionDescription = document.createElement("p");
        correctionDescription.textContent =
            "Review this suggested revision before using it.";

        const correctionText = document.createElement("div");
        correctionText.className = "correction-text";

        correctionText.textContent =
            analysis.correctedContent || content;

        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.textContent = "Copy Correction";

        copyButton.addEventListener("click", async function () {

            try {
                await navigator.clipboard.writeText(
                    correctionText.textContent
                );

                copyButton.textContent = "Copied! ✓";

            } catch (error) {
                copyButton.textContent = "Copy unavailable";
            }

        });

        correctionSection.append(
            correctionHeading,
            correctionDescription,
            correctionText,
            copyButton
        );

        results.appendChild(correctionSection);

    } catch (error) {

        results.textContent = "Error: " + error.message;

    } finally {

        analyseBtn.disabled = false;
        analyseBtn.textContent = "Analyse Content →";

    }

});

// ==========================================
// LOGO PREVIEW AND AI COMPARISON
// ==========================================

const referenceInput = document.getElementById("referenceLogo");
const submittedInput = document.getElementById("submittedLogo");

const referencePreview = document.getElementById("referencePreview");
const submittedPreview = document.getElementById("submittedPreview");

const compareLogosBtn = document.getElementById("compareLogosBtn");
const logoResults = document.getElementById("logoResults");

// Show image previews when files are selected
function showLogoPreview(input, preview) {
    input.addEventListener("change", function () {
        const file = input.files[0];

        preview.replaceChildren();

        if (!file) {
            preview.textContent = "No image selected.";
            return;
        }

        const image = document.createElement("img");
        image.src = URL.createObjectURL(file);
        image.alt = "Selected logo preview";

        preview.appendChild(image);
    });
}

showLogoPreview(referenceInput, referencePreview);
showLogoPreview(submittedInput, submittedPreview);


// Compare the two logos using Gemini AI
compareLogosBtn.addEventListener("click", async function () {

    const referenceFile = referenceInput.files[0];
    const submittedFile = submittedInput.files[0];

    if (!referenceFile || !submittedFile) {
        logoResults.textContent =
            "Please upload both logos before comparing.";
        return;
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];

    if (
        !allowedTypes.includes(referenceFile.type) ||
        !allowedTypes.includes(submittedFile.type)
    ) {
        logoResults.textContent =
            "Please upload PNG, JPG, or WEBP images only.";
        return;
    }

    if (
        referenceFile.size > 5 * 1024 * 1024 ||
        submittedFile.size > 5 * 1024 * 1024
    ) {
        logoResults.textContent =
            "Each logo must be smaller than 5 MB.";
        return;
    }

    compareLogosBtn.disabled = true;
    compareLogosBtn.textContent = "Comparing Logos...";

    logoResults.textContent =
        "VerifyAI is comparing your logos using AI...";

    try {

        const formData = new FormData();

        formData.append("referenceLogo", referenceFile);
        formData.append("submittedLogo", submittedFile);

        const response = await fetch(
            "https://verifyai-backend-c4kr.onrender.com/api/compare-logos",
            {
                method: "POST",
                body: formData
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Logo comparison failed.");
        }

        const comparison = data.comparison;

        logoResults.replaceChildren();

        const score = document.createElement("h3");
        score.textContent =
            "Similarity Score: " + comparison.similarityScore + "/100";

        const verdict = document.createElement("p");
        verdict.textContent = "Verdict: " + comparison.verdict;

        const differencesHeading = document.createElement("h4");
        differencesHeading.textContent = "Visual Differences";

        const differencesList = document.createElement("ul");

        comparison.differences.forEach(difference => {
            const item = document.createElement("li");
            item.textContent = difference;
            differencesList.appendChild(item);
        });

        const recommendationsHeading = document.createElement("h4");
        recommendationsHeading.textContent = "Recommendations";

        const recommendationsList = document.createElement("ul");

        comparison.recommendations.forEach(recommendation => {
            const item = document.createElement("li");
            item.textContent = recommendation;
            recommendationsList.appendChild(item);
        });

        logoResults.append(
            score,
            verdict,
            differencesHeading,
            differencesList,
            recommendationsHeading,
            recommendationsList
        );

    } catch (error) {

        logoResults.textContent =
            "Error: " + error.message;

    } finally {

        compareLogosBtn.disabled = false;
        compareLogosBtn.textContent = "Compare Logos →";

    }

});
