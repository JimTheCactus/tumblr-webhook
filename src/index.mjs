import Tumblr from "tumblr.js";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager"
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb"

const MAXRETRIES = 5;
const secretClient = new SecretsManagerClient({})
const secretCommmand = new GetSecretValueCommand({
  SecretId: process.env.CONFIGSECRET
})
const secretResult = await secretClient.send(secretCommmand)
const config = JSON.parse(secretResult.SecretString);

const dbClient = new DynamoDBClient({});
const tableName = process.env.DATABASE;

const url = config.webhookUrl;
const client = Tumblr.createClient({
  ...config.credentials,
});

const setLastPost = async (postId) => {
  const updateLastItemCommand = new UpdateItemCommand({
    TableName: tableName,
    Key: {
      id: { "S": "lastPost" }
    },
    UpdateExpression: "SET postId = :data",
    ExpressionAttributeValues: {
      ":data": {"N": postId },
    },
    ReturnValues: "UPDATED_NEW",
  })
  
  await dbClient.send(updateLastItemCommand);
};

const readLastPost = async () => {
  console.log(`Reading ${tableName}`)
  const getLastItemCommand = new GetItemCommand({
    TableName: tableName,
    Key: {
      id: { "S": "lastPost" }
    }
  })
  try {
    const result = await dbClient.send(getLastItemCommand);
    return result.Item?.postId?.N;
  } catch (err) {
    console.error("[ERROR] DB read call errored!", err)
    return undefined;
  }
}

const getInitialPost = async () => {
  const dashboard = await client.userDashboard({});
  if (dashboard.posts) {
    var post = dashboard.posts[0];
    console.log("[INFO] Starting from post ID " + post.id);
    return post.id;
  } else {
    console.warn(
      "[WARNING] Failed to get initial post ID. Dashboard is empty? Using 0.",
    );
    return 0;
  }
};

const handlePost = async (post) => {
  console.info(`[INFO] Starting handling ${post.id}`);
  
  try {
    if (post.tags && post.tags.indexOf("nogummy") > -1) {
      console.info("[INFO] Gummy suppression tag found. skipping.");
      return Promise(() => {});
    }

    const embed = {
      title: post.blog_name,
      description: post.summary,
      url: post.short_url,
    };

    const message = {
      embeds: [embed],
    };

    try {
      const avatar = await client.blogAvatar(post.blog.name, 512);
      message.avatar_url = avatar.avatar_url;
    } catch {
      console.warn("[WARNING] Failed to retreive avatar, skipping.");
    }
    const bodyText = JSON.stringify(message);

    console.info("[INFO] Broadcasting post ID " + post.id);

    let count = 0;
    let posted = false;
    while (!posted && count < MAXRETRIES) {
      count++;
      const response = await fetch(
        url,
        {
          method: "POST",
          headers: {
            'Content-Type': 'application/json', // Set the content type
          },
          body: bodyText,
        });
      if (response.status == 429) {
        // If we're being rate limited, wait the requested time and re-raise the event.
        const retry_after = Number(response.headers.get("Retry-After")) || 2;
        console.warn(
          "[WARNING] Rate Limited! Holding off " + retry_after + " s",
        );
        await Promise((resolve) => setTimeout(resolve, retry_after * 1000));
      } else if(response.status >= 200 && response.status < 300) {
        posted = true;
      } else {
        console.info(`[INFO] Got status ${response.status} from the server. Body: `, await response.text())
        throw new Error("Failed to broadcast post due to server error!")
      }
    }
  } catch (err) {
    console.error("[ERROR] Failed to relay post!", err);
  }
};

export const handler = async () => {
  let lastPost = await readLastPost();

  if (!lastPost) {
    lastPost = await getInitialPost()
    console.info(`[INFO] Intializing DB with current post: ${lastPost}`);
    const count = await setLastPost(lastPost);
    console.info(`[INFO] Now at ${lastPost} after updating ${count} records.`);
  }

  const dashboard = await client.userDashboard({ since_id: lastPost });
  if (!dashboard.posts) {
    return;
  }

  console.info("[INFO] Posts: " + dashboard.posts.length);
  const pendingPosts = dashboard.posts.map(handlePost);

  await Promise.allSettled(pendingPosts);

  if (dashboard.posts.length > 0) {
    await setLastPost(dashboard.posts[0].id);
  }
};
