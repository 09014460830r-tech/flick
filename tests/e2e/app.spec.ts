import { expect, test } from "@playwright/test";
import { addTask, flick, login, memo, ready, settled, taskByText, tasks } from "./helpers";

test.describe("起動", () => {
  test("読み込み中は全画面スケルトンを表示し、完了後に消える", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route("**/api/me", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto("/");
    const skeleton = page.getByTestId("skeleton");
    await expect(skeleton).toBeVisible();
    await expect(page.getByTestId("header-skeleton")).toBeVisible();
    // The skeleton fills the viewport below the memo field.
    const box = (await skeleton.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y + box.height).toBeGreaterThan(viewport.height * 0.6);
    release();
    await ready(page);
    await expect(page.getByTestId("header-skeleton")).toHaveCount(0);
  });

  test("開いた瞬間にメモ欄へフォーカスされ、読み込み中でも入力できる", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route("**/api/me", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto("/");
    await expect(memo(page)).toBeFocused();
    // Type immediately, while the skeleton is still showing.
    await page.keyboard.type("Buy milk");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("skeleton")).toBeVisible();
    release();
    await ready(page);
    await expect(taskByText(page, "Buy milk")).toHaveCount(1);
  });

  test("キャッチコピー等の余計な文言を表示しない", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const text = (await page.locator("main").innerText()).replace(/\s+/g, "");
    // "メモ" is the memo field's label; everything else is a control or a count.
    expect(text).toBe("Flickログインメモすべて0未着手0進行中0完了0");
  });

  test("コンソールエラーが出ない", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      // 401 from /api/me is the expected signed-out probe.
      if (m.type() === "error" && !m.text().includes("401")) errors.push(m.text());
    });
    await login(page);
    await ready(page);
    await addTask(page, "check console");
    await flick(page, taskByText(page, "check console"), 220);
    await expect(taskByText(page, "check console")).toHaveAttribute("data-status", "doing");
    expect(errors).toEqual([]);
  });
});

test.describe("メモ入力", () => {
  test("Enterで追加され、欄が空になりフォーカスが残る", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await addTask(page, "企画書を書く");
    await expect(memo(page)).toHaveValue("");
    await expect(memo(page)).toBeFocused();
    await expect(taskByText(page, "企画書を書く")).toHaveAttribute("data-status", "todo");
  });

  test("送信ボタンでも追加でき、空欄では押せない", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const send = page.getByRole("button", { name: "追加" });
    await expect(send).toBeDisabled();
    await memo(page).fill("ボタンで追加");
    await send.click();
    await expect(taskByText(page, "ボタンで追加")).toHaveCount(1);
  });

  test("日本語変換確定のEnterでは送信しない", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await memo(page).fill("にほんご");
    await memo(page).evaluate((el) => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true, keyCode: 229 }));
    });
    await expect(memo(page)).toHaveValue("にほんご");
    await expect(tasks(page)).toHaveCount(0);
  });

  test("Shift+Enterで改行できる", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await memo(page).fill("一行目");
    await memo(page).press("Shift+Enter");
    await page.keyboard.type("二行目");
    await expect(memo(page)).toHaveValue("一行目\n二行目");
  });

  test("どこで打鍵してもメモ欄に入る", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await memo(page).blur();
    await page.getByRole("tablist").click();
    await expect(memo(page)).not.toBeFocused();
    await page.keyboard.type("abc");
    await expect(memo(page)).toBeFocused();
    await expect(memo(page)).toHaveValue("abc");
  });

  test("書きかけのメモはリロードしても残る", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await memo(page).fill("下書き");
    await page.reload();
    await expect(memo(page)).toHaveValue("下書き");
  });

  test("未ログインでもタスクは端末に保存される", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await addTask(page, "ゲストのタスク");
    await page.reload();
    await ready(page);
    await expect(taskByText(page, "ゲストのタスク")).toHaveCount(1);
  });
});

test.describe("フリックでステータス管理", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await ready(page);
  });

  test("右フリックで 未着手 → 進行中 → 完了", async ({ page }) => {
    await addTask(page, "右へ");
    const row = taskByText(page, "右へ");
    await flick(page, row, 220);
    await expect(row).toHaveAttribute("data-status", "doing");
    await flick(page, row, 220);
    await expect(row).toHaveAttribute("data-status", "done");
    await expect(page.getByRole("tab", { name: /完了/ })).toContainText("1");
  });

  test("完了をさらに右フリックしても変わらない", async ({ page }) => {
    await addTask(page, "上限");
    const row = taskByText(page, "上限");
    await flick(page, row, 220);
    await flick(page, row, 220);
    await expect(row).toHaveAttribute("data-status", "done");
    await flick(page, row, 220);
    await page.waitForTimeout(500);
    await expect(row).toHaveAttribute("data-status", "done");
  });

  test("左フリックで1つ戻る", async ({ page }) => {
    await addTask(page, "左へ");
    const row = taskByText(page, "左へ");
    await flick(page, row, 220);
    await flick(page, row, 220);
    await expect(row).toHaveAttribute("data-status", "done");
    await flick(page, row, -220);
    await expect(row).toHaveAttribute("data-status", "doing");
  });

  test("未着手を左フリックで削除し、元に戻せる", async ({ page }) => {
    await addTask(page, "消す");
    await flick(page, taskByText(page, "消す"), -220);
    await expect(taskByText(page, "消す")).toHaveCount(0);
    await page.getByRole("button", { name: "元に戻す" }).click();
    await expect(taskByText(page, "消す")).toHaveCount(1);
    await expect(taskByText(page, "消す")).toHaveAttribute("data-status", "todo");
  });

  test("短くゆっくりなドラッグではステータスが変わらない", async ({ page }) => {
    await addTask(page, "そのまま");
    const row = taskByText(page, "そのまま");
    await flick(page, row, 40, { steps: 20 });
    await page.waitForTimeout(500);
    await expect(row).toHaveAttribute("data-status", "todo");
    await expect(row.locator(".card")).toHaveCSS("transform", /matrix\(1, 0, 0, 1, 0, 0\)|none/);
  });

  test("フリック後にカードが展開されない", async ({ page }) => {
    await addTask(page, "展開しない");
    const row = taskByText(page, "展開しない");
    await flick(page, row, 220);
    await expect(row).toHaveAttribute("data-status", "doing");
    await expect(row.getByRole("button", { expanded: true })).toHaveCount(0);
  });

  test("ドラッグ中は次のステータスが背面に現れる", async ({ page }) => {
    await addTask(page, "プレビュー");
    const card = taskByText(page, "プレビュー").locator(".card");
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 30 + i * 12, box.y + box.height / 2);
    await expect(taskByText(page, "プレビュー").locator(".reveal")).toContainText("進行中");
    const bg = await taskByText(page, "プレビュー").locator(".reveal").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    await page.mouse.up();
  });

  test("フィルタ表示中にフリックすると一覧から抜ける", async ({ page }) => {
    await addTask(page, "A");
    await addTask(page, "B");
    await page.getByRole("tab", { name: /未着手/ }).click();
    await expect(tasks(page)).toHaveCount(2);
    await flick(page, taskByText(page, "A"), 220);
    await expect(tasks(page)).toHaveCount(1);
    await page.getByRole("tab", { name: /進行中/ }).click();
    await expect(tasks(page)).toHaveCount(1);
    await expect(taskByText(page, "A")).toHaveCount(1);
  });

  test("タップで展開し、ボタンでもステータス変更・編集・削除できる", async ({ page }) => {
    await addTask(page, "タップ");
    const row = taskByText(page, "タップ");
    await row.locator(".card").click();
    await expect(row.getByRole("button", { expanded: true })).toHaveCount(1);
    await row.getByRole("button", { name: "完了", exact: true }).click();
    await expect(row).toHaveAttribute("data-status", "done");
    const editor = page.getByLabel("タスクを編集");
    await editor.fill("タップ（編集済み）");
    await editor.press("Enter");
    await expect(taskByText(page, "タップ（編集済み）")).toHaveCount(1);
    // Wait for the action row's exit animation before tapping again.
    await expect(page.getByRole("button", { name: "削除" })).toHaveCount(0);
    await taskByText(page, "タップ（編集済み）").locator(".card").click();
    await expect(taskByText(page, "タップ（編集済み）").locator(".card")).toHaveAttribute("aria-expanded", "true");
    await taskByText(page, "タップ（編集済み）").getByRole("button", { name: "削除" }).click();
    await expect(tasks(page)).toHaveCount(0);
    await expect(page.getByTestId("empty")).toBeVisible();
  });

  test("キーボードの矢印キーでも操作できる", async ({ page }) => {
    await addTask(page, "キー操作");
    const card = taskByText(page, "キー操作").locator(".card");
    await card.focus();
    await page.keyboard.press("ArrowRight");
    await expect(taskByText(page, "キー操作")).toHaveAttribute("data-status", "doing");
  });
});

test.describe("Google認証とクラウド同期", () => {
  test("ログインボタンからGoogle認証のみを提示する", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByRole("button", { name: "ログイン" }).click();
    const dialog = page.getByRole("dialog", { name: "ログイン" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link")).toHaveCount(1);
    await expect(dialog.getByRole("link", { name: "Googleでログイン" })).toHaveAttribute("href", "/auth/google");
  });

  test("/auth/google は PKCE 付きで Google の認可画面へリダイレクトする", async ({ request }) => {
    const res = await request.get("/auth/google", { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const url = new URL(res.headers()["location"]);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(res.headers()["set-cookie"]).toMatch(/oauth=.*HttpOnly/i);
  });

  test("state不一致のコールバックは拒否される", async ({ page }) => {
    await page.goto("/auth/google/callback?code=x&state=forged");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("status")).toHaveText("ログインできませんでした");
  });

  test("ログイン後のタスクはサーバーに保存され、リロード後も残る", async ({ page }) => {
    await login(page);
    await ready(page);
    await addTask(page, "クラウド");
    await flick(page, taskByText(page, "クラウド"), 220);
    await expect(taskByText(page, "クラウド")).toHaveAttribute("data-status", "doing");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await ready(page);
    await expect(taskByText(page, "クラウド")).toHaveAttribute("data-status", "doing");
  });

  test("ログイン前に書いたタスクはログイン時にアカウントへ取り込まれる", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await addTask(page, "ゲストから移行");
    await login(page);
    await ready(page);
    await expect(taskByText(page, "ゲストから移行")).toHaveCount(1);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await ready(page);
    await expect(taskByText(page, "ゲストから移行")).toHaveCount(1);
  });

  test("ログアウトするとゲスト状態に戻る", async ({ page }) => {
    await login(page);
    await ready(page);
    await addTask(page, "非公開");
    await page.getByRole("button", { name: "アカウント" }).click();
    await page.getByRole("menuitem", { name: "ログアウト" }).click();
    await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible();
    await expect(taskByText(page, "非公開")).toHaveCount(0);
    expect((await page.request.get("/api/me")).status()).toBe(401);
  });

  test("他人のタスクは閲覧・変更できない", async ({ browser }) => {
    const alice = await browser.newPage();
    await login(alice);
    await ready(alice);
    await addTask(alice, "アリスの秘密");
    await alice.waitForLoadState("networkidle");
    const { tasks: list } = await (await alice.request.get("/api/tasks")).json();
    const id = list[0].id as string;

    const bob = await browser.newPage();
    await login(bob);
    const bobList = await (await bob.request.get("/api/tasks")).json();
    expect(bobList.tasks).toEqual([]);
    const patch = await bob.request.patch(`/api/tasks/${id}`, { data: { status: "done" } });
    expect(patch.status()).toBe(404);
    await bob.request.delete(`/api/tasks/${id}`);
    const after = await (await alice.request.get("/api/tasks")).json();
    expect(after.tasks[0]).toMatchObject({ id, status: "todo" });
  });

  test("未認証のAPIアクセスは401", async ({ request }) => {
    expect((await request.get("/api/tasks")).status()).toBe(401);
    expect((await request.post("/api/ai/suggest", { data: { text: "x" } })).status()).toBe(401);
  });

  test("本番設定には dev-login / AI スタブが含まれない", async ({ request }) => {
    // The e2e environment enables it; production config (top-level wrangler vars) does not define DEV_LOGIN.
    const config = await import("node:fs").then((fs) => fs.readFileSync("wrangler.jsonc", "utf8"));
    const topLevel = config.slice(0, config.indexOf('"env"'));
    expect(topLevel).not.toContain("DEV_LOGIN");
    expect(topLevel).not.toContain("AI_MOCK");
    expect((await request.get("/auth/dev-login", { maxRedirects: 0 })).status()).toBe(302);
  });
});

test.describe("AI（Workers AI）", () => {
  test("未ログインでAIを押すとログインを求める", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await memo(page).fill("買い物、掃除");
    await page.getByRole("button", { name: "AIでタスクに分割" }).click();
    await expect(page.getByRole("dialog", { name: "ログイン" })).toBeVisible();
  });

  test("メモをAIでタスクに分割し、選んだものだけ追加する", async ({ page }) => {
    await login(page);
    await ready(page);
    await memo(page).fill("牛乳を買う、メールを返す、部屋を掃除する");
    await page.getByRole("button", { name: "AIでタスクに分割" }).click();
    const dialog = page.getByRole("dialog", { name: "AI" });
    await expect(dialog.getByTestId("suggestion")).toHaveCount(3);
    await dialog.getByRole("checkbox", { name: "メールを返す" }).click();
    await expect(dialog.getByRole("checkbox", { name: "メールを返す" })).toHaveAttribute("aria-checked", "false");
    await dialog.getByRole("button", { name: "2件追加" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(taskByText(page, "牛乳を買う")).toHaveCount(1);
    await expect(taskByText(page, "部屋を掃除する")).toHaveCount(1);
    await expect(taskByText(page, "メールを返す")).toHaveCount(0);
    await expect(memo(page)).toHaveValue("");
  });

  test("AI応答待ちはスケルトンを表示する", async ({ page }) => {
    await login(page);
    await ready(page);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route("**/api/ai/suggest", async (route) => {
      await gate;
      await route.continue();
    });
    await memo(page).fill("A、B");
    await page.getByRole("button", { name: "AIでタスクに分割" }).click();
    await expect(page.getByTestId("ai-loading")).toBeVisible();
    release();
    await expect(page.getByTestId("suggestion")).toHaveCount(2);
  });

  test("AIが失敗したら再試行できる", async ({ page }) => {
    await login(page);
    await ready(page);
    let fail = true;
    await page.route("**/api/ai/suggest", (route) =>
      fail ? route.fulfill({ status: 502, body: "{}" }) : route.continue(),
    );
    await memo(page).fill("X、Y");
    await page.getByRole("button", { name: "AIでタスクに分割" }).click();
    fail = false;
    await page.getByRole("button", { name: "再試行" }).click();
    await expect(page.getByTestId("suggestion")).toHaveCount(2);
  });

  test("タスクをAIで分解できる", async ({ page }) => {
    await login(page);
    await ready(page);
    await addTask(page, "引っ越し");
    await taskByText(page, "引っ越し").locator(".card").click();
    await page.getByRole("button", { name: "AIで分解" }).click();
    const dialog = page.getByRole("dialog", { name: "AI" });
    await expect(dialog.getByTestId("suggestion")).toHaveCount(3);
    await dialog.getByRole("button", { name: "3件追加" }).click();
    await expect(tasks(page)).toHaveCount(4);
  });

  test("シートは下スワイプで閉じる", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByRole("button", { name: "ログイン" }).click();
    const sheet = page.getByRole("dialog", { name: "ログイン" });
    await expect(sheet).toBeVisible();
    await expect.poll(() => sheet.evaluate((el) => el.style.transform)).toMatch(/^(none)?$/);
    const box = await settled(sheet);
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    // Stay inside the viewport: pointer events stop at the window edge.
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(box.x + box.width / 2, box.y + 10 + i * 15);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await expect(sheet).toHaveCount(0);
  });
});

test.describe("見た目", () => {
  test("白ベースのLiquid Glass（背景ぼかし）が適用されている", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const header = page.locator(".header");
    const style = await header.evaluate((el) => {
      const s = getComputedStyle(el);
      return { backdrop: s.backdropFilter || (s as unknown as Record<string, string>).webkitBackdropFilter };
    });
    expect(style.backdrop).toContain("blur");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g)!.map(Number);
    expect(Math.min(r, g, b)).toBeGreaterThan(235);
  });

  test("モバイル幅で横スクロールが発生しない", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await addTask(page, "とても長いタスク名".repeat(10));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
