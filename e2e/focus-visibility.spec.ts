import { expect, test, type Page } from "@playwright/test";
import { Long, MongoClient, ObjectId } from "mongodb";
import { ensureNativeIndexes } from "../prisma/native/indexes.mjs";
import { createNativeRepositories } from "../prisma/native/repositories";
import { listingSchema } from "../app/schemas/listing";

const photo = "https://res.cloudinary.com/ci-cloud/image/upload/focus-fixture.jpg";
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=",
  "base64",
);

type Focus = { description: string; covered: string[] } | null;

/**
 * Describes the focused element and which fixed chrome its box intersects.
 * Returns null once focus leaves the page. Controls that live in fixed or
 * sticky chrome themselves (header links, the skip link) are not checked.
 */
function inspectFocus(page: Page) {
  return page.evaluate((): Focus => {
    const element = document.activeElement;
    if (!element || element === document.body) return null;
    const description = `${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 60)}"`;
    for (let node: Element | null = element; node; node = node.parentElement) {
      if (["fixed", "sticky"].includes(getComputedStyle(node).position)) return { description, covered: [] };
    }
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return { description, covered: [] };
    const chrome: [string, Element | null][] = [
      ["preview banner", document.querySelector("body > aside")],
      ["site header", document.querySelector("body header.fixed")],
      ["mobile Auction bar", document.querySelector("section[aria-label='Live auction quick actions']")],
    ];
    const covered = chrome.flatMap(([name, node]) => {
      if (!node || getComputedStyle(node).display === "none") return [];
      const bar = node.getBoundingClientRect();
      return rect.top < bar.bottom - 0.5 && rect.bottom > bar.top + 0.5 ? [name] : [];
    });
    return { description, covered };
  });
}

/** Waits until smooth scrolling has stopped moving the page. */
function scrollSettled(page: Page) {
  return page.evaluate(() => new Promise<void>((resolve) => {
    let last = window.scrollY;
    let stableFrames = 0;
    const check = () => {
      stableFrames = window.scrollY === last ? stableFrames + 1 : 0;
      last = window.scrollY;
      if (stableFrames >= 5) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }));
}

/** Tabs forward through the page, then back, checking every focus stop. */
async function expectFocusNeverCovered(page: Page, maxStops = 150) {
  const failures: string[] = [];
  let visited = 0;
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let stop = 0; stop < maxStops; stop++) {
      await page.keyboard.press(key);
      await scrollSettled(page);
      const focus = await inspectFocus(page);
      if (!focus) break;
      visited++;
      if (focus.covered.length) failures.push(`${key} → ${focus.description} is under the ${focus.covered.join(" and ")}`);
    }
  }
  expect(visited, "The page has focusable elements").toBeGreaterThan(10);
  expect(failures).toEqual([]);
}

test.describe("focused elements stay clear of fixed chrome", () => {
  test("on a non-account page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/faq");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectFocusNeverCovered(page);
  });

  test("on a live Listing at mobile width", async ({ browser }) => {
    const client = new MongoClient(process.env.E2E_MONGODB_URL!, { serverSelectionTimeoutMS: 5_000 });
    const database = client.db();
    let ownsDatabase = false;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
      expect(await database.listCollections().toArray(), "Use an empty browser test database").toEqual([]);
      ownsDatabase = true;
      await ensureNativeIndexes(database);
      const repositories = createNativeRepositories(database);
      const seller = await repositories.users.create({ name: "Focus Seller", email: "focus-seller@example.test", emailVerified: new Date() });
      const now = new Date();
      const { id } = await repositories.listingAuthoring.create(seller.id, listingSchema.parse({
        make: "Porsche", model: "Cayman", year: 2021, miles: 24000, location: "Boston, MA",
        description: "A well-maintained Cayman with a documented ownership history.",
        transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Clean",
        serviceHistory: "Annual oil service documented.", modifications: "None known.", knownFlaws: "None known.",
        images: [photo, photo.replace("focus-fixture", "focus-fixture-2")],
      }), now);
      await database.collection("Listing").updateOne({ _id: new ObjectId(id) }, { $set: {
        reviewStatus: "APPROVED",
        status: "LIVE",
        auctionStartsAt: new Date(now.getTime() - 60_000),
        auctionEndsAt: new Date(now.getTime() + 3_600_000),
        startingBid: Long.fromNumber(10_000),
        bidIncrement: Long.fromNumber(500),
      } });

      await context.route("https://res.cloudinary.com/**", (route) => route.fulfill({ contentType: "image/png", body: pixel }));
      await context.route(/^https?:\/\/(?!127\.0\.0\.1:3100(?:\/|$))(?!res\.cloudinary\.com\/)/, (route) => route.abort());
      await context.routeWebSocket(/pusher\.com/, (socket) => socket.close());
      const page = await context.newPage();
      await page.goto(`/listing/${id}`);
      await expect(page.getByRole("region", { name: "Live auction quick actions" })).toBeVisible();
      await expectFocusNeverCovered(page);
    } finally {
      await context.close();
      try {
        if (ownsDatabase) await database.dropDatabase();
      } finally {
        await client.close();
      }
    }
  });
});
