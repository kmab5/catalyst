# Four-minute Catalyst walkthrough

Use the local builds of Taxonomy and the Full Stack FastAPI Template backend. Before presenting, open both once with a working provider and keep their project indexes. Confirm the **Overview** and **Ask** screens load from the intended checkout.

```sh
node packages/cli/dist/index.js index ../catalyst-testbeds/taxonomy
node packages/cli/dist/index.js index ../catalyst-testbeds/full-stack-fastapi-template/backend
node packages/cli/dist/index.js serve ../catalyst-testbeds/taxonomy
```

| Time | Action | What to say or point to |
| --- | --- | --- |
| 0:00–0:30 | Open Taxonomy's **Overview**. | “A teammate just handed you this repository. Where does a Stripe event enter the app, and what changes if the session helper changes?” Point to the detected stack and its evidence. |
| 0:30–1:05 | Open **Features**, choose the billing or subscription feature, and open its webhook entry point. | Follow the route to `app/api/webhooks/stripe/route.ts`. The handler calls `stripe.webhooks.constructEvent` to verify the incoming event. Show the feature's members and one changeability reason. |
| 1:05–1:45 | Press **Ctrl+K** (⌘K on macOS). Search for `getCurrentUser` and choose the result in `lib/session.ts`. In the X-Ray, open **Connections**, then the blast-radius link under **If you change this**. | The helper reads the server session and returns its user. Follow one upstream connection to its caller. In Graph, identify a node by opening its source. |
| 1:45–2:50 | Open **Ask** and submit **Where do we handle Stripe webhooks?** Open a citation. Then ask **Do we have password reset?** | Show the cited handler. For the second answer, read the places the agent checked and explain what that evidence covers. |
| 2:50–3:15 | Open **Health**. Select a flagged file and open its evidence. | Read one concrete signal, such as a dependency cycle or high fan-in. Follow the file link so the audience can inspect the finding. |
| 3:15–3:45 | Use the project switcher, choose **Open another folder…**, then choose the FastAPI `backend` project from **Recent**. Open **Overview** and **Explorer**. | Find the items endpoint and its model. The same navigation works across a TypeScript app and a Python backend. |
| 3:45–4:00 | Return to the Taxonomy webhook or session helper. | Close on a code citation that the audience can check in the repository. |

For a live incremental-index demonstration, make a small edit in a disposable copy of Taxonomy before the presentation. Use the status menu to re-index, then open the changed file in Explorer. Keep the original warm demo checkout available.

## Screen fallback

These captures show the real Taxonomy project after an AI run stopped partway through. The feature page shows a group derived from dependencies. Billing feature discovery and both Ask answers require a working provider for the live walkthrough.

| Cue | Screenshot |
| --- | --- |
| Identify Next.js, Prisma and Stripe, then point to the webhook route. | [Structural Overview](screenshots/overview.png) |
| Open the group containing the webhook and point to the changeability evidence. | [Dependency group](screenshots/feature.png) |
| Follow a resolved caller of `getCurrentUser`. | [Session helper X-Ray](screenshots/xray.png) |
| Show the session file's two-hop neighborhood. | [Focused dependency graph](screenshots/graph.png) |
| Open the route finding and check its interpretation against the Stripe signature verification in source. | [Structural Health findings](screenshots/health.png) |
