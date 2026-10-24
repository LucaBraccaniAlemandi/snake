// Tiny static shop used as the demo target. The coupon field is hidden behind a
// "Have a code?" link on purpose: it gives the LLM a realistic failure to self-fix.
const html = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Demo Shop</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #222; }
  .products { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
  .card, .panel { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; }
  button { cursor: pointer; padding: .4rem .8rem; }
  nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
  .hidden { display: none; }
  .muted { color: #777; font-size: .9rem; }
  a { color: #2563eb; cursor: pointer; }
</style>
</head>
<body>
<nav><h1>Demo Shop</h1><button id="cart-btn">Cart (<span id="count">0</span>)</button></nav>

<section id="shop">
  <div class="products">
    <div class="card"><h3>Mug</h3><p>$20.00</p><button data-add="Mug" data-price="20">Add to cart</button></div>
    <div class="card"><h3>T-shirt</h3><p>$30.00</p><button data-add="T-shirt" data-price="30">Add to cart</button></div>
    <div class="card"><h3>Hoodie</h3><p>$50.00</p><button data-add="Hoodie" data-price="50">Add to cart</button></div>
  </div>
</section>

<section id="cart" class="panel hidden">
  <h2>Your cart</h2>
  <ul id="items"></ul>
  <p class="muted"><a id="code-link">Have a code?</a></p>
  <div id="coupon" class="hidden">
    <label>Coupon code <input id="code" /></label>
    <button id="apply">Apply</button>
    <p id="coupon-msg" role="status"></p>
  </div>
  <p>Subtotal: <span id="subtotal">$0.00</span></p>
  <p id="discount-row" class="hidden">Discount: -<span id="discount">$0.00</span></p>
  <p><strong>Total: <span id="total">$0.00</span></strong></p>
  <button id="back">Continue shopping</button>
  <button id="checkout">Checkout</button>
</section>

<section id="done" class="panel hidden">
  <h2>Thanks for your order!</h2>
  <p>Order total: <span id="paid"></span></p>
</section>

<script>
  const cart = []; let discount = 0;
  const $ = (id) => document.getElementById(id);
  const money = (n) => "$" + n.toFixed(2);
  const show = (id) => ["shop", "cart", "done"].forEach((s) => $(s).classList.toggle("hidden", s !== id));
  function render() {
    $("count").textContent = cart.length;
    $("items").innerHTML = cart.map((i) => "<li>" + i.name + " — " + money(i.price) + "</li>").join("") || "<li>Your cart is empty</li>";
    const sub = cart.reduce((a, i) => a + i.price, 0);
    $("subtotal").textContent = money(sub);
    $("discount").textContent = money(sub * discount);
    $("discount-row").classList.toggle("hidden", !discount);
    $("total").textContent = money(sub * (1 - discount));
  }
  document.querySelectorAll("[data-add]").forEach((b) => b.onclick = () => {
    cart.push({ name: b.dataset.add, price: Number(b.dataset.price) }); render();
  });
  $("cart-btn").onclick = () => { show("cart"); history.replaceState(null, "", "/cart"); };
  $("back").onclick = () => { show("shop"); history.replaceState(null, "", "/"); };
  $("code-link").onclick = () => $("coupon").classList.remove("hidden");
  $("apply").onclick = () => {
    const ok = $("code").value.trim().toUpperCase() === "SAVE10";
    discount = ok ? 0.1 : 0;
    $("coupon-msg").textContent = ok ? "Coupon SAVE10 applied: 10% off" : "Invalid code";
    render();
  };
  $("checkout").onclick = () => {
    if (!cart.length) return;
    $("paid").textContent = $("total").textContent;
    show("done"); history.replaceState(null, "", "/confirmation");
  };
  render();
</script>
</body>
</html>`;

const port = Number(process.env.DEMO_SHOP_PORT ?? 3002);
Bun.serve({ port, fetch: () => new Response(html, { headers: { "content-type": "text/html" } }) });
console.log(`demo-shop on http://localhost:${port}`);
