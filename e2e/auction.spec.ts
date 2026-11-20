import { expect, test, type Browser, type Page } from "@playwright/test";
import bcrypt from "bcrypt";
import { MongoClient, ObjectId } from "mongodb";
import { ensureNativeIndexes } from "../prisma/native/indexes.mjs";
import { createNativeRepositories } from "../prisma/native/repositories";
import type { AcceptedBidResponse } from "../app/types/auction-events";

const password = "Browser fixture password 24";
const photo = "https://res.cloudinary.com/ci-cloud/image/upload/auction-fixture.jpg";
const vehicle = /2021 Porsche Cayman/i;
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=",
  "base64",
);

async function signIn(browser: Browser, email: string) {
  const context = await browser.newContext();
  await context.route("https://res.cloudinary.com/**", (route) =>
    route.fulfill({ contentType: "image/png", body: pixel }),
  );
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:3100(?:\/|$))(?!res\.cloudinary\.com\/)/, (route) =>
    route.abort(),
  );
  await context.routeWebSocket(/pusher\.com/, (socket) => socket.close());
  const page = await context.newPage();
  await page.goto("/signin");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  return page;
}

async function submitListing(seller: Page) {
  await seller.goto("/submit-listing");
  for (const [label, value] of Object.entries({
    Make: "Porsche",
    Model: "Cayman",
    Year: "2021",
    Mileage: "24000",
    Location: "Boston, MA",
    Description: "A well-maintained Cayman with a documented ownership history.",
  })) {
    await seller.getByLabel(label, { exact: true }).fill(value);
  }
  await seller.getByLabel("Transmission").selectOption("Manual");
  await seller.getByLabel("Drivetrain").selectOption("Rear-wheel drive");
  await seller.getByLabel("Title status").selectOption("Clean");
  await seller.getByRole("button", { name: /continue to condition/i }).click();
  await seller.getByLabel("Service history").fill("Annual oil service documented.");
  await seller.getByLabel("Modifications").fill("None known.");
  await seller.getByLabel("Known flaws").fill("None known.");
  await seller.getByRole("button", { name: /continue to photos/i }).click();
  await seller.route("**/api/uploads", (route) => route.fulfill({ status: 201, json: { url: photo } }));
  const choosingPhoto = seller.waitForEvent("filechooser");
  await seller.getByRole("button", { name: "Add photos", exact: true }).click();
  await (await choosingPhoto).setFiles({
    name: "cayman.png",
    mimeType: "image/png",
    buffer: pixel,
  });
  await expect(seller.getByText(/1 \/ 20 photos/)).toBeVisible();
  await seller.getByRole("button", { name: /preview listing/i }).click();
  await expect(seller.getByRole("heading", { name: vehicle })).toBeVisible();
  await seller.getByRole("button", { name: "Submit listing", exact: true }).click();
  await expect(seller).toHaveURL(/\/listing\/[a-f0-9]{24}$/);
  await expect(seller.getByText("Awaiting review", { exact: true })).toBeVisible();
  return new URL(seller.url()).pathname;
}

async function confirmBid(page: Page, amount: number) {
  await page.getByLabel("Your bid amount in dollars").fill(String(amount));
  await page.getByRole("button", { name: "Review bid", exact: true }).click();
  await page.getByRole("button", { name: `Confirm bid of $${amount.toLocaleString("en-US")}` }).click();
}

test("seller submission through auction close and buyer/seller handoff", async ({ browser, request }) => {
  const client = new MongoClient(process.env.E2E_MONGODB_URL!, { serverSelectionTimeoutMS: 5_000 });
  const database = client.db();
  let ownsDatabase = false;
  try {
    // The config restricts the URL to a dedicated loopback database. Preserve existing data.
    expect(await database.listCollections().toArray(), "Use an empty browser test database").toEqual([]);
    ownsDatabase = true;
    await ensureNativeIndexes(database);
    const repositories = createNativeRepositories(database);
    const hashedPassword = await bcrypt.hash(password, 4);
    const createUser = async (name: string, email: string) => {
      const user = await repositories.users.create({ name, email, hashedPassword, emailVerified: new Date() });
      return { id: user.id, email };
    };
    const seller = await createUser("Browser Seller", "seller@example.test");
    const admin = await createUser("Browser Admin", "admin@example.test");
    const first = await createUser("First Bidder", "first@example.test");
    const winner = await createUser("Winning Bidder", "winner@example.test");
    await database.collection("User").updateOne({ _id: new ObjectId(admin.id) }, { $set: { role: "ADMIN" } });
    // Seed the ownership entry that the real upload API would register after Cloudinary returns.
    await repositories.assets.register({
      id: "browser-fixture", userId: seller.id, listingId: null, kind: "PHOTO",
      url: photo, bytes: pixel.length, format: "png",
    });

    const [sellerPage, adminPage, firstPage, winnerPage] = await Promise.all(
      [seller, admin, first, winner].map(({ email }) => signIn(browser, email)),
    );
    const listingPath = await test.step("Seller submits a private listing", () => submitListing(sellerPage));
    const id = new ObjectId(listingPath.split("/").pop());
    const listings = database.collection<{ auctionEndsAt: Date }>("Listing");

    await test.step("Admin approves and seller starts the auction", async () => {
      await adminPage.goto(`/admin/listings/${id}`);
      await adminPage.getByRole("button", { name: "Approve listing" }).click();
      await expect(adminPage.getByText(/listing approved\. the seller/i)).toBeVisible();
      await sellerPage.reload();
      await sellerPage.getByLabel("End Time").fill(new Date(Date.now() + 600_000).toISOString().slice(0, 16));
      await sellerPage.getByLabel("Starting Bid").fill("10000");
      await sellerPage.getByLabel("Bid Increment").fill("500");
      const started = sellerPage.waitForResponse((response) => response.url().endsWith("/api/auction-start"));
      await sellerPage.getByRole("button", { name: "Start an Auction" }).click();
      expect((await started).status()).toBe(201);
    });

    await test.step("First bidder retries a committed bid after losing the response", async () => {
      await firstPage.goto(listingPath);
      const keys: (string | undefined)[] = [];
      let committed: AcceptedBidResponse | undefined;
      let replay: AcceptedBidResponse | undefined;
      await firstPage.route("**/api/place-bid", async (route) => {
        keys.push(route.request().headers()["idempotency-key"]);
        const response = await route.fetch();
        if (keys.length === 1) {
          if (response.ok()) committed = await response.json();
          await route.abort();
        } else {
          if (response.ok()) replay = await response.json();
          await route.fulfill({ response });
        }
      });
      await confirmBid(firstPage, 10_000);
      await expect(firstPage.getByRole("button", { name: "Retry same bid" })).toBeVisible();
      await firstPage.getByRole("button", { name: "Retry same bid" }).click();
      await expect(firstPage.getByText("Your bid of $10,000 was accepted.")).toBeVisible();
      expect(keys[0]).toBeTruthy();
      expect(keys).toEqual([keys[0], keys[0]]);
      expect(committed?.bid.amount).toBe(10_000);
      expect(replay).toEqual(committed);
      expect(await database.collection("Bid").countDocuments({ listingId: id })).toBe(1);
    });

    await test.step("Second bidder outbids and extends the auction in the final two minutes", async () => {
      const nearEnd = new Date(Date.now() + 90_000);
      await listings.updateOne({ _id: id }, { $set: { auctionEndsAt: nearEnd } });
      await winnerPage.goto(listingPath);
      const accepted = winnerPage.waitForResponse((response) => response.url().endsWith("/api/place-bid"));
      await confirmBid(winnerPage, 10_500);
      const response = await accepted;
      expect(response.status()).toBe(201);
      const bid: AcceptedBidResponse = await response.json();
      expect(Date.parse(bid.auctionEndsAt)).toBe(Date.parse(bid.bid.createdAt) + 120_000);
      expect(Date.parse(bid.auctionEndsAt)).toBeGreaterThan(nearEnd.getTime());
      expect((await listings.findOne({ _id: id }))?.auctionEndsAt.toISOString()).toBe(bid.auctionEndsAt);
      await expect(winnerPage.getByText("You’re leading")).toBeVisible();
    });

    await test.step("Finalization records a win and exposes the sale to both parties", async () => {
      await listings.updateOne({ _id: id }, { $set: { auctionEndsAt: new Date(Date.now() - 1_000) } });
      const response = await request.get("/api/cron/finalize-auctions", {
        headers: { Authorization: "Bearer browser-test-cron-secret" },
      });
      expect(response.ok()).toBe(true);
      expect(await response.json()).toMatchObject({ finalized: 1, failed: 0 });
      await winnerPage.reload();
      await expect(winnerPage.getByText(/sold to Winning Bidder/i)).toBeVisible();
      await winnerPage.goto("/account/shipments");
      await expect(winnerPage.getByText(/auction won/i)).toBeVisible();
      await expect(winnerPage.getByRole("heading", { name: vehicle })).toBeVisible();
      await sellerPage.goto("/account/shipments");
      await sellerPage.getByRole("tab", { name: /sales/i }).click();
      await expect(sellerPage.getByText(/sold at auction/i)).toBeVisible();
      await expect(sellerPage.getByRole("heading", { name: vehicle })).toBeVisible();
    });
  } finally {
    await Promise.all(browser.contexts().map((context) => context.close()));
    try {
      if (ownsDatabase) await database.dropDatabase();
    } finally {
      await client.close();
    }
  }
});
