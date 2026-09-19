exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, OPTIONS"
        },
        body: ""
      };
    }

    const rawQuery = event.queryStringParameters?.q || "";

    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were",
      "to", "of", "in", "on", "for", "and", "or",
      "with", "this", "that", "has", "have", "had",
      "from", "by", "as", "at", "it", "its", "be",
      "will", "can", "may", "new", "all", "before",
      "now", "very", "more", "than", "into", "about",
      "they", "their", "you", "your", "who", "what"
    ]);

    const keywords = rawQuery
      .replace(/[^\w\s₹$€£-]/g, " ")
      .split(/\s+/)
      .map(word => word.trim())
      .filter(word => word.length > 2)
      .filter(word => !stopWords.has(word.toLowerCase()))
      .filter((word, index, arr) =>
        arr.findIndex(
          w => w.toLowerCase() === word.toLowerCase()
        ) === index
      )
      .slice(0, 8);

    if (keywords.length === 0) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          error: "Please provide a search query."
        })
      };
    }

    const query = keywords.join(" ");

    const apiKey = process.env.NEWS_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
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
      `&pageSize=20`;

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
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          error: data.message || "News API request failed."
        })
      };
    }

    const rawArticles = data.articles || [];

    /*
      Publisher domain registry.

      IMPORTANT:
      "Verified" here means the article URL belongs to a
      publisher/domain configured by ClearCheck.
      It does NOT mean that the article's claim is true.
    */
    const trustedDomains = {
      "Reuters": [
        "reuters.com"
      ],

      "BBC News": [
        "bbc.com",
        "bbc.co.uk"
      ],

      "The Hindu": [
        "thehindu.com"
      ],

      "The Indian Express": [
        "indianexpress.com"
      ],

      "Hindustan Times": [
        "hindustantimes.com"
      ],

      "NDTV": [
        "ndtv.com"
      ],

      "The Times of India": [
        "timesofindia.indiatimes.com"
      ],

      "India Today": [
        "indiatoday.in"
      ],

      "CNN": [
        "cnn.com"
      ],

      "Al Jazeera": [
        "aljazeera.com"
      ]
    };

    function getHostname(articleUrl) {
      try {
        return new URL(articleUrl).hostname
          .toLowerCase()
          .replace(/^www\./, "");
      } catch {
        return "";
      }
    }

    function verifySource(article) {
      const sourceName =
        (article.source?.name || "").trim();

      const hostname =
        getHostname(article.url);

      /*
        First try matching the known publisher name.
      */
      const configuredDomains =
        trustedDomains[sourceName];

      if (configuredDomains) {
        const matched = configuredDomains.some(domain =>
          hostname === domain ||
          hostname.endsWith("." + domain)
        );

        if (matched) {
          return {
            verified: true,
            status: "VERIFIED SOURCE",
            reason: "Publisher name and article domain match the configured source record."
          };
        }
      }

      /*
        If the publisher isn't in our configured registry,
        don't call it fake. Mark it as unknown.
      */
      return {
        verified: false,
        status: "SOURCE NOT VERIFIED",
        reason:
          "This publisher is not currently in ClearCheck's configured source registry."
      };
    }

    /*
      Remove duplicate URLs and headlines.
    */
    const seenUrls = new Set();
    const seenTitles = new Set();

    const uniqueArticles = rawArticles.filter(article => {

      const urlKey =
        (article.url || "")
          .trim()
          .toLowerCase();

      const titleKey =
        (article.title || "")
          .toLowerCase()
          .replace(/[^\w\s]/g, "")
          .replace(/\s+/g, " ")
          .trim();

      if (!urlKey && !titleKey) {
        return false;
      }

      if (urlKey && seenUrls.has(urlKey)) {
        return false;
      }

      if (titleKey && seenTitles.has(titleKey)) {
        return false;
      }

      if (urlKey) {
        seenUrls.add(urlKey);
      }

      if (titleKey) {
        seenTitles.add(titleKey);
      }

      return true;
    });

    /*
      Prefer different sources.
    */
    const selected = [];
    const usedSources = new Set();

    for (const article of uniqueArticles) {

      const sourceName =
        (article.source?.name || "Unknown source").trim();

      if (!usedSources.has(sourceName)) {

        selected.push(article);
        usedSources.add(sourceName);
      }

      if (selected.length >= 6) {
        break;
      }
    }

    /*
      Fill remaining slots if necessary.
    */
    if (selected.length < 6) {

      for (const article of uniqueArticles) {

        if (selected.length >= 6) {
          break;
        }

        const alreadySelected = selected.some(
          item =>
            item.url &&
            article.url &&
            item.url === article.url
        );

        if (!alreadySelected) {
          selected.push(article);
        }
      }
    }

    /*
      Build final article response.
    */
    const articles = selected.map(article => {

      const verification =
        verifySource(article);

      return {
        title: article.title,
        description: article.description,
        source: article.source?.name,
        url: article.url,
        image: article.urlToImage,
        publishedAt: article.publishedAt,

        // Source verification information
        sourceVerified: verification.verified,
        sourceStatus: verification.status,
        sourceVerificationReason: verification.reason
      };
    });

    return {
      statusCode: 200,

      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },

      body: JSON.stringify({
        totalResults: data.totalResults,
        queryUsed: query,
        articles
      })
    };

  } catch (error) {

    console.error(
      "Related news error:",
      error
    );

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