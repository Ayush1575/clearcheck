exports.handler = async (event) => {
  try {
    const claim = event.queryStringParameters?.claim || "";
    const articlesRaw = event.queryStringParameters?.articles || "";

    if (!claim.trim()) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          error: "Claim is required."
        })
      };
    }

    const HF_TOKEN = process.env.HF_TOKEN;

    if (!HF_TOKEN) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          error: "Hugging Face token is not configured."
        })
      };
    }

    let articles = [];

    try {
      articles = JSON.parse(articlesRaw);
    } catch {
      articles = [];
    }

    if (!Array.isArray(articles) || articles.length === 0) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          claim,
          evidence: []
        })
      };
    }

    // Analyze a maximum of 4 articles
    const selectedArticles = articles.slice(0, 4);

    const modelUrl =
      "https://router.huggingface.co/hf-inference/models/facebook/bart-large-mnli";

    const evidence = [];

    for (const article of selectedArticles) {

      const articleText =
        `${article.title || ""}. ${article.description || ""}`.trim();

      if (!articleText) {
        continue;
      }

      const response = await fetch(modelUrl, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + HF_TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs:
            `Claim: ${claim}\n\nArticle: ${articleText}`,

          parameters: {
            candidate_labels: [
              "supports the claim",
              "contradicts the claim",
              "mentions the topic but does not verify the claim"
            ],
            multi_label: false
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Hugging Face evidence error:", data);
        continue;
      }

      const topResult = data[0];

      if (!topResult) {
        continue;
      }

      let signal = "UNCLEAR";

      if (topResult.label === "supports the claim") {
        signal = "SUPPORTS";
      }

      if (topResult.label === "contradicts the claim") {
        signal = "CONTRADICTS";
      }

      if (
        topResult.label ===
        "mentions the topic but does not verify the claim"
      ) {
        signal = "UNCLEAR";
      }

      evidence.push({
        title: article.title || "Related article",
        source: article.source || "Unknown source",
        url: article.url || "",
        signal: signal,
        confidence: Math.round(topResult.score * 100)
      });
    }

    const supportCount =
      evidence.filter(item => item.signal === "SUPPORTS").length;

    const contradictCount =
      evidence.filter(item => item.signal === "CONTRADICTS").length;

    const unclearCount =
      evidence.filter(item => item.signal === "UNCLEAR").length;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        claim,
        evidence,
        summary: {
          supporting: supportCount,
          contradicting: contradictCount,
          unclear: unclearCount
        },
        model: "facebook/bart-large-mnli"
      })
    };

  } catch (error) {

    console.error("Evidence analysis error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: "Unable to analyze evidence."
      })
    };
  }
};