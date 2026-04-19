# Tumblr-webhook
Tumblr-webhook is an AWS Lambda module designed to be used as a junction between a Tumblr dashboard
and a Discord channel, essentially directing people to the Tumblr website with short embeds of
Tumblr posts as they're posted.

## Configuration
Tumblr-webhook uses environment variables for configuration. You'll need the variables below:

```shell
WEBHOOK # The URL to the Discord webhook.
CONSUMER_KEY # The consumer key for your registered Tumblr app
CONSUMER_SECRET # The consumer secret for your registered Tumblr app
TOKEN # The token for your registered Tumblr app
TOKEN_SECRET # The token secret for your registered Tumblr app
```
Otherwise, just zip up the contents of tumblr-webhook, ship it off to AWS and you're off to the
races!
