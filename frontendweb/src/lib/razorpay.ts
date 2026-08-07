const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let loadingPromise: Promise<void> | null = null;

/** Injects Razorpay's Checkout script once and resolves once window.Razorpay is ready. */
export function loadRazorpayScript(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.onload = () => resolve();
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error("Failed to load Razorpay checkout script."));
    };
    document.body.appendChild(script);
  });

  return loadingPromise;
}
