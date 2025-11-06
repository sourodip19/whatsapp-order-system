const express = require("express");
const mongoose = require("mongoose");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

// MongoDB Schema
const orderSchema = new mongoose.Schema({
  customerName: String,
  whatsappNumber: String,
  address: String,
  timing: String,
  orders: String,
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

const Order = mongoose.model("Order", orderSchema);

// WhatsApp Client Setup
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  console.log("📱 Scan this QR code with WhatsApp:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("✅ WhatsApp client is ready!");
});

client.on("authenticated", () => {
  console.log("🔐 WhatsApp authenticated!");
});

client.initialize();

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ADD THIS TEST ROUTE FOR WHATSAPP
app.get("/api/test-whatsapp", async (req, res) => {
  try {
    const ownerNumber = process.env.OWNER_NUMBER;
    const testMessage = `🔧 TEST MESSAGE\n\nThis is a test from your order system!\nTime: ${new Date().toLocaleString()}`;

    console.log("📤 Sending test message to:", ownerNumber);

    // Send test message to owner
    await client.sendMessage(ownerNumber, testMessage);

    res.json({
      success: true,
      message: "Test message sent to owner! Check your WhatsApp.",
    });
  } catch (error) {
    console.error("WhatsApp test error:", error);
    res.json({
      success: false,
      message: "Failed to send test message",
      error: error.message,
    });
  }
});

// ORDER ROUTE (keep only this one, remove the commented version)
app.post("/api/order", async (req, res) => {
  try {
    const { customerName, whatsappNumber, address, timing, orders } = req.body;

    // Validate required fields
    if (!customerName || !whatsappNumber || !address || !timing || !orders) {
      return res.status(400).json({
        success: false,
        message: "All fields are required.",
      });
    }

    // Validate phone number (should start with 91 and have 12 digits total)
    const cleanWhatsappNumber = whatsappNumber.replace(/\s/g, "");
    if (
      !cleanWhatsappNumber.startsWith("91") ||
      cleanWhatsappNumber.length !== 12
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit Indian mobile number.",
      });
    }

    // ✅ DUPLICATE CHECK: Prevent same order within 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const recentOrder = await Order.findOne({
      whatsappNumber: cleanWhatsappNumber,
      orders: orders,
      createdAt: { $gte: twoMinutesAgo },
    });

    if (recentOrder) {
      return res.status(400).json({
        success: false,
        message: "Similar order was placed recently. Please wait a moment.",
      });
    }

    // Save to MongoDB
    const newOrder = new Order({
      customerName,
      whatsappNumber: cleanWhatsappNumber,
      address,
      timing,
      orders,
    });

    await newOrder.save();
    console.log("✅ Order saved to database:", newOrder._id);

    // Format numbers for WhatsApp (already has 91 prefix)
    const ownerNumber = process.env.OWNER_NUMBER;
    const customerNumber = `${cleanWhatsappNumber}@c.us`;

    console.log("📤 Sending to owner:", ownerNumber);
    console.log("📤 Sending to customer:", customerNumber);

    // Create messages
    const ownerMessage = `📦 *NEW ORDER RECEIVED* 📦\n\n👤 *Customer:* ${customerName}\n📞 *WhatsApp:* +${cleanWhatsappNumber}\n🏠 *Address:* ${address}\n⏰ *Timing:* ${timing}\n📋 *Orders:* ${orders}\n\n🕒 *Order Time:* ${new Date().toLocaleString()}`;

    const customerMessage = `✅ *Order Confirmed!*\n\nThank you ${customerName}! Your order has been received.\n\n📋 *Orders:* ${orders}\n⏰ *Timing:* ${timing}\n🏠 *Address:* ${address}\n\nWe'll contact you shortly on this number.`;

    // Send to Owner
    await client.sendMessage(ownerNumber, ownerMessage);
    console.log("📤 Message sent to owner");

    // Send to Customer
    await client.sendMessage(customerNumber, customerMessage);
    console.log("📤 Confirmation sent to customer");

    res.json({
      success: true,
      message: "Order placed successfully! Check WhatsApp for confirmation.",
    });
  } catch (error) {
    console.error("Order error:", error);
    res.status(500).json({
      success: false,
      message: "Error placing order. Please try again.",
      error: error.message,
    });
  }
});

// Add a test route to check MongoDB connection
app.get("/api/test", async (req, res) => {
  try {
    const ordersCount = await Order.countDocuments();
    res.json({
      success: true,
      message: "Server is running!",
      database: "Connected to MongoDB",
      totalOrders: ordersCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message,
    });
  }
});

// Connect to MongoDB and start server
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB");
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📝 Test the app: http://localhost:${PORT}`);
      console.log(`🔧 API Test: http://localhost:${PORT}/api/test`);
      console.log(
        `📱 WhatsApp Test: http://localhost:${PORT}/api/test-whatsapp`
      );
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });
