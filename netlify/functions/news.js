exports.handler = async (event) => {
  try {
    const rawQuery = event.queryStringParameters?.q || "";

    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were",
      "to", "of", "in", "on", "for", "and", "or",
      "with", "this", "that", "has", "have", "had",
      "from", "by", "as", "at", "it", "its", "be",
      "will", "can", "may", "new"
    ]);

    const keywords = rawQuery
      .replace(/[^\w\s₹$€£-]/g, " ")
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !stopWords.has(word.toLowerCase()))
      .slice(0, 8);

    const query = keywords.join(" ");

    if (!query) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: "Please provide a search query."
        })
      };
    }

    const apiKey = process.env.NEWS_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: "News API key is not configured."
        })
      };
    }

    const url =
      `https://newsapi.org/v2/everything?` +
      `q=${encodeURIComponent(query)}` +
      `&language=en` +
      `&sortBy=relevancy` +
      `&pageSize=6`;

    const response = await fetch(url, {
      headers: {
        "X-Api-Key": apiKey
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: data.message || "News API request failed."
        })
      };
    }

    const articles = (data.articles || []).map(article => ({
      title: article.title,
      description: article.description,
      source: article.source?.name,
      url: article.url,
      image: article.urlToImage,
      publishedAt: article.publishedAt
    }));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        totalResults: data.totalResults,
        articles
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: "Unable to fetch related news."
      })
    };
  }
};