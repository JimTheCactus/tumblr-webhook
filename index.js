var fs = require('fs');
var EventEmitter = require('events');
var Tumblr = require('tumblr.js');
var request = require('request')

var watcher;
var url;

class DashboardWatcher extends EventEmitter {
	constructor(config) {
		super();

		this._config = config;
		this._client = new Tumblr.Client({
			credentials: config.tumblrcredentials,
			returnPromises: true,
		});
		this._lastpost = 0;
		this._timer = null;
	}

	start() {
		if (this._timer != null) return;

		console.log("[INFO] Fetching initial post ID...");

		// Grab the initial ID
		this._client.userDashboard({}).then((result) => {
			if (result.posts) {
				var post = result.posts[0];
				this._lastpost = post.id;
				console.log("[INFO] Starting from post ID " + this._lastpost);
			}
			else {
				this._lastpost = 0;
				console.log("[WARNING] Failed to get initial post ID. Dashboard is empty? Using 0.");
			}
			this._timer = setInterval(() => {
				console.log("[INFO] Checking for posts...");
				this._client.userDashboard({since_id: this._lastpost}).then((result) => {
					console.log("[INFO] Got result.");
					if (!result.posts) {
						console.log("[INFO] No Posts.");
						return;
					}
					if (result.posts.length <= 0) {
						console.log("[INFO] No Posts.");
						return;
					}

					console.log("[INFO] Posts: " + result.posts.length);
					result.posts.forEach((post) => {
						console.log("[INFO] Found post " + post.id);

						if (post.tags && post.tags.indexOf("nogummy") > -1) {
							console.log("[INFO] Gummy suppression tag found. skipping.")
							return
						}

						this._client.blogAvatar(post.blog.name,512).then((avatar_result) => {
							this.emit("newpost", post, avatar_result.avatar_url, this);
						}).catch((failure) => {
							console.log("[WARNING] Failed to retreive avatar, skipping. Cause:");
							console.log(error);
							this.emit("newpost", post, null, this);
						});
					});
					this._lastpost = result.posts[0].id;
					console.log("Now at " + this._lastpost);
				}).catch(function(error) {
					console.log("[ERROR] Failed to retreive posts. Cause:");
					console.log(error);
				});
				}, 60000);
		});

	}
}

function handlePost(post, avatar_url, source) {
	var embed = {
		title: post.blog_name,
		description: post.summary,
		url: post.short_url
	}

	var message = {
		embeds: [embed]
	}

	if (avatar_url) {
		message.avatar_url =  avatar_url;
	}

	console.log("[INFO] Broadcasting post ID " + post.id);

	request.post(
		{
			url: url,
			json: message
		},
		function (err,response, body) {
			// If we're being rate limited, wait the requested time and re-raise the event.
			if (response.statusCode == 429) {
				console.log("[WARNING] Rate Limited! Holding off " + body.retry_after + " ms");
				setTimeout(function() { source.emit("newpost", post, avatar_url, source); }, body.retry_after);
			}
		});
}


fs.readFile('config.json', 'utf8', function (err, data) {
  if (err) throw err;
  config = JSON.parse(data);
  url = config.webhookurl;
  watcher = new DashboardWatcher(config);
  watcher.on("newpost", handlePost);
  watcher.start();
});

// Handle a bug in the Docker/Node.js interaction
process.on('SIGINT', function() {process.exit();});
