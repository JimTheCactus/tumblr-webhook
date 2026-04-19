import Tumblr from "tumblr.js";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager"

const MAXRETRIES = 5;
const secretClient = new SecretsManagerClient({})
const secretCommmand = new GetSecretValueCommand({
  SecretId: process.env.CONFIGSECRET
})
const secretResult = await secretClient.send(secretCommmand)
const config = JSON.parse(secretResult.SecretString);

const url = config.webhookUrl;
const client = Tumblr.createClient({
  ...config.credentials,
});
let lastPost = undefined;

const getInitialPost = async () => {
  const dashboard = await client.userDashboard({});
  if (dashboard.posts) {
    var post = dashboard.posts[0];
    console.log("[INFO] Starting from post ID " + post.id);
    return post.id;
  } else {
    console.log(
      "[WARNING] Failed to get initial post ID. Dashboard is empty? Using 0.",
    );
    return 0;
  }
};

const setLastPost = async (postId) => {
  // TODO: Replace this later with a KVS
  lastPost = postId;
};

const handlePost = async (post) => {
  try {
    const embed = {
      title: post.blog_name,
      description: post.summary,
      url: post.short_url,
    };

    const message = {
      embeds: [embed],
    };

    try {
      message.avatar_url = await client.blogAvatar(post.blog.name, 512);
    } catch (error) {
      console.log("[WARNING] Failed to retreive avatar, skipping. Cause:");
      console.log(error);
    }

    console.log("[INFO] Broadcasting post ID " + post.id);

    let count = 0;
    let posted = false;
    while (!posted && count < MAXRETRIES) {
      count++;
      const response = await fetch.post({
        url: url,
        json: message,
      });
      if (response.statusCode == 429) {
        // If we're being rate limited, wait the requested time and re-raise the event.
        const retry_after = Number(response.headers.get("Retry-After")) || 2;
        console.log(
          "[WARNING] Rate Limited! Holding off " + retry_after + " s",
        );
        await Promise((resolve) => setTimeout(resolve, retry_after * 1000));
      } else {
        posted = true;
      }
    }
  } catch (err) {
    console.log("[ERROR] Failed to relay post!");
    console.log(err);
  }
};

export const handler = async (event) => {
  console.log(`Processing request ${event.awsRequestId}`);
  if (!lastPost) {
    setLastPost(await getInitialPost());
  }

  console.log("[INFO] Checking for posts...");
  const dashboard = await client.userDashboard({ since_id: lastPost });
  console.log("[INFO] Got result.");
  if (!dashboard.posts) {
    console.log("[INFO] No Posts.");
    return;
  }

  console.log("[INFO] Posts: " + dashboard.posts.length);
  const pendingPosts = dashboard.posts.map(async (post) => {
    console.log("[INFO] Found post " + post.id);

    if (post.tags && post.tags.indexOf("nogummy") > -1) {
      console.log("[INFO] Gummy suppression tag found. skipping.");
      return Promise(() => {});
    }

    return pendingPosts.push(handlePost(post));
  });

  await Promise.allSettled(pendingPosts);

  if (dashboard.posts.length > 0) {
    setLastPost(dashboard.posts[0].id);
  }
  console.log("Now at " + lastPost);
};
