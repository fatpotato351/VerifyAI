
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
