# Thursday AI For All

A free, captcha-gated proxy for AI inference. No account, no API key to buy.

<api-key-widget>
  <p>
    One click to
    <a href="https://ai-for-all.trythursday.org">get an API key</a>.
  </p>
</api-key-widget>

## Why?

When [I](https://shantaram.xyz) was a youngin coming up in the brand new world
of AI, I was incredibly interested. But I had no money to buy inference tokens.
Inference is now cheap enough, and I am now fortunate enough, that I can give
away a small amount of AI tokens for others like me who are looking to learn
and experiment. Please do not abuse this service for running agentic workflows
-- use it for running small experiments. You have much better free coding agents
at your disposal, like [OpenCode](https://opencode.ai) and
[Command Code](https://commandcode.ai).

There was also a practical reason for building it - I wanted to have a way for
people to try free AI services backed by open models that I was building as
experiments for my current project, [Thursday](https://trythursday.org).

This service is backed by an OpenRouter API key with a few dollars in credit.
If it runs out, I will add more. This is as much an experiment in cheap/open
models as it is an experiment in human kindness.

## API

Errors return `{ ok: false, error: { message, type, code } }`. Successful
inference responses are standard OpenAI chat completions.

Base URL: `https://ai-for-all.trythursday.org/api/v1`

### `POST /issue/challenge`

Ask for a proof-of-work challenge. You get `payload.challenge` (`c`, `s`, `d`)
and a `payload.token`. Solve it, then send the nonces back with the token.
Limited to one request per minute per IP.

### `POST /issue`

Redeem a solved challenge for an API key.

```json
{ "token": "...", "solutions": [1, 2, 3] }
```

Returns `payload.apiKey` (starts with `sk-th-`, valid for 30 days) and the
expiry in the `X-Key-Expires-At` and `X-Key-TTL` headers. One key per day per
IP. A solved challenge can only be redeemed once.

### `POST /chat/completions`

OpenAI-compatible chat completions. Send `messages`; tools, streaming and the
rest of the OpenAI body pass straight through. 60 requests per hour per key.
Limits: 16k input tokens, 16k output tokens, 32k context. `max_tokens` is
clamped to whatever room is left.

```sh
curl https://ai-for-all.trythursday.org/api/v1/chat/completions \
  -H "Authorization: Bearer sk-th-..." \
  -H "Content-Type: application/json" \
  -d '{"model": "local", "messages": [{"role": "user", "content": "hi"}]}'
```

### `GET /models`

Lists the model aliases and what they point at.

- `local` · `qwen/qwen3.8-flash` (Qwen3.8 Flash), provider-default quant ·
  cheap, the default
- `frontier` · `deepseek/deepseek-v4.1-flash` (DeepSeek V4.1 Flash), fp8 only ·
  bigger, for when `local` isn't enough

## Help me

<balance-widget id="balance">
  <p>
    <a href="https://ai-for-all.trythursday.org/#balance">Service budget</a>
  </p>
</balance-widget>

If you think this is an interesting idea, you can kick a few bucks my way to
help keep the service running. If you use AI For All and find it helpful or
use it to get into a situation where you can keep the cycle going, please do!
You can also host a copy yourself and keep all the good will for your own.

If you can't contribute financially or by forwarding the service - sharing helps!
Show it to your friends. Build cool stuff. Leave me feedback on Thursday. Or
send a nice email showing me what you built, or just say hi!

- [Contact](https://shantaram.xyz/contact/)
- [Donate](https://shantaram.xyz/contact/donate.html)
- [Thursday issue tracker](https://github.com/trythursday/thursday)
