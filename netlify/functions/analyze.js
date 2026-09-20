exports.handler = async (event) => {
  try {
    const claim = event.queryStringParameters?.q || "";

    if (!claim.trim()) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          error: "Please provide a claim."
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

    const modelUrl =
      "https://router.huggingface.co/hf-inference/models/facebook/bart-large-mnli";

    const response = await fetch(modelUrl, {
      method: "POST",

      headers: {
        "Authorization": "Bearer " + HF_TOKEN,
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        inputs: claim,

        parameters: {
          candidate_labels: [
            "credible sounding claim",
            "misleading sounding claim",
            "unverified claim"
          ],
          multi_label: false
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Hugging Face error:", data);

      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          error: "ML model request failed."
        })
      };
    }

    const topResult = data[0];

    const topLabel = topResult
      ? topResult.label
      : "unverified claim";

    const confidence = topResult
      ? Math.round(topResult.score * 100)
      : 0;

    let assessment = "UNVERIFIED";

    if (topLabel === "credible sounding claim") {
      assessment = "SUPPORTED SIGNAL";
    }

    if (topLabel === "misleading sounding claim") {
      assessment = "MISLEADING SIGNAL";
    }

    return {
      statusCode: 200,

      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },

      body: JSON.stringify({
        claim: claim,
        assessment: assessment,
        confidence: confidence,
        model: "facebook/bart-large-mnli",
        results: data
      })
    };

  } catch (error) {

    console.error("Server error:", error);

    return {
      statusCode: 500,

      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },

      body: JSON.stringify({
        error: "Unable to analyze the claim."
      })
    };
  }
};