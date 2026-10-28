import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { PLANS } from "@/lib/stripe";
import { isSubscriptionEntitled } from "@/data/fishingSpots";
import {
  Fish,
  Check,
  Crown,
  ArrowRight,
  Calendar,
  Camera,
  Heart,
  MapPin,
  Cloud,
  Hotel,
  Sparkles,
  Mail,
  Download,
  Loader2,
} from "lucide-react";
const CheckoutSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const plan = (
    searchParams.get("plan") === "monthly" ? "monthly" : "yearly"
  ) as "monthly" | "yearly";
  const subscriptionId = searchParams.get("sub") || "";
  const [user, setUser] = useState<any>(null); // 'pending' = waiting for the stripe-webhook to upsert the row // 'active' = webhook has run and subscription is live // 'timeout' = took longer than expected (still likely fine, just show success)
  const [subStatus, setSubStatus] = useState<"pending" | "active" | "timeout">(
    "pending",
  );
  useEffect(() => {
    let mounted = true;
    let pollTimer: number | undefined;
    const markActive = () => {
      if (!mounted) return;
      setSubStatus("active");
      if (pollTimer) window.clearInterval(pollTimer);
    };
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        // Not logged in - just show the success page generically
        if (mounted) setSubStatus("active");
        return;
      }
      setUser(session.user);
      const userId = session.user.id; // 1) Immediate check (in case webhook already fired before we landed here)
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("user_id", userId)
        .in("status", ["active", "trialing"])
      if ((existing || []).some(isSubscriptionEntitled)) {
        markActive();
        return;
      } // 2) Polling for the webhook upsert. We deliberately avoid Supabase // Realtime channels here — the hosted backend's websocket can deliver // malformed binary frames that crash the supabase-js Phoenix decoder // with "TypeError: n is not iterable". Polling is rock-solid.
      let elapsed = 0;
      pollTimer = window.setInterval(async () => {
        elapsed += 2000;
        const { data } = await supabase
          .from("subscriptions")
          .select("status, current_period_end")
          .eq("user_id", userId)
          .in("status", ["active", "trialing"])
        if ((data || []).some(isSubscriptionEntitled)) {
          markActive();
          return;
        }
        if (elapsed >= 30000) {
          if (mounted) setSubStatus("timeout");
          if (pollTimer) window.clearInterval(pollTimer);
        }
      }, 2000);
    };
    init();
    window.scrollTo(0, 0);
    return () => {
      mounted = false;
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, []);
  const planDetails = PLANS[plan];
  const today = new Date();
  const renewDate = new Date();
  if (plan === "yearly") {
    renewDate.setFullYear(renewDate.getFullYear() + 1);
  } else {
    renewDate.setMonth(renewDate.getMonth() + 1);
  }
  const nextSteps = [
    {
      icon: MapPin,
      title: "Explore All Fishing Spots",
      desc: "Browse and search hundreds of fishing spots across all 50 states",
      action: () => navigate("/"),
      cta: "Browse Spots",
    },
    {
      icon: Camera,
      title: "Log Your First Catch",
      desc: "Track your catches with photos, location, and details",
      action: () => navigate("/my-catches"),
      cta: "Open Catch Log",
    },
    {
      icon: Calendar,
      title: "Plan a Fishing Trip",
      desc: "Use our trip planner to organize your next adventure",
      action: () => navigate("/my-trips"),
      cta: "Plan a Trip",
    },
    {
      icon: Heart,
      title: "Save Your Favorites",
      desc: "Bookmark spots you love for quick access later",
      action: () => navigate("/"),
      cta: "Find Favorites",
    },
  ];
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
      {" "}
      {/* Header */}{" "}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20">
        {" "}
        <div className="max-w-7xl mx-auto px-4 py-4">
          {" "}
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3 hover:opacity-80 transition"
          >
            {" "}
            <div className="bg-blue-500 p-2 rounded-lg">
              {" "}
              <Fish className="w-7 h-7 text-white" />{" "}
            </div>{" "}
            <div>
              {" "}
              <h1 className="text-xl font-bold text-white">
                FishingFinderUSA
              </h1>{" "}
              <p className="text-blue-300 text-xs">Order Confirmation</p>{" "}
            </div>{" "}
          </button>{" "}
        </div>{" "}
      </header>{" "}
      <div className="max-w-4xl mx-auto px-4 py-12">
        {" "}
        {/* Success Hero */}{" "}
        <div className="text-center mb-10">
          {" "}
          <div className="relative inline-block mb-6">
            {" "}
            <div className="absolute inset-0 bg-green-500/30 rounded-full blur-2xl animate-pulse"></div>{" "}
            <div className="relative w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-green-500/40">
              {" "}
              <Check className="w-12 h-12 text-white" strokeWidth={3} />{" "}
            </div>{" "}
          </div>{" "}
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-4 py-1.5 mb-4">
            {" "}
            <Crown className="w-4 h-4 text-amber-400" />{" "}
            <span className="text-amber-300 text-sm font-medium">
              Welcome to Pro
            </span>{" "}
          </div>{" "}
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Payment Successful!
          </h1>{" "}
          <p className="text-xl text-blue-200/80 max-w-xl mx-auto">
            {" "}
            Thank you for subscribing to FishingFinderUSA Pro. Your account has
            been upgraded.{" "}
          </p>{" "}
          {/* Webhook activation status — confirms the stripe-webhook upserted the subscription row and Pro features are live. */}{" "}
          {subStatus === "pending" && (
            <div className="mt-5 inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-4 py-2 text-blue-200 text-sm">
              {" "}
              <Loader2 className="w-4 h-4 animate-spin" /> Activating your Pro
              membership...{" "}
            </div>
          )}{" "}
          {subStatus === "active" && (
            <div className="mt-5 inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-4 py-2 text-green-300 text-sm">
              {" "}
              <Check className="w-4 h-4" /> Pro features unlocked — ready to
              use!{" "}
            </div>
          )}{" "}
          {subStatus === "timeout" && (
            <div className="mt-5 inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-4 py-2 text-amber-200 text-sm">
              {" "}
              <Mail className="w-4 h-4" /> Activation taking longer than usual —
              refresh in a moment if Pro hasn't unlocked.{" "}
            </div>
          )}{" "}
        </div>{" "}
        {/* Order Receipt */}{" "}
        <div className="bg-slate-800/60 rounded-2xl border border-slate-700 overflow-hidden mb-8">
          {" "}
          <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-b border-amber-500/20 p-6">
            {" "}
            <div className="flex items-center justify-between flex-wrap gap-3">
              {" "}
              <div>
                {" "}
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  {" "}
                  <Sparkles className="w-5 h-5 text-amber-400" /> Order Receipt{" "}
                </h2>{" "}
                <p className="text-sm text-gray-400 mt-1">
                  {" "}
                  Confirmation #
                  {subscriptionId
                    ? subscriptionId.slice(-12).toUpperCase()
                    : "PRO-" + Date.now().toString().slice(-8)}{" "}
                </p>{" "}
              </div>{" "}
              <Button
                variant="outline"
                onClick={() => window.print()}
                className="border-slate-600 text-gray-300 hover:bg-slate-700"
                size="sm"
              >
                {" "}
                <Download className="w-4 h-4 mr-2" /> Print Receipt{" "}
              </Button>{" "}
            </div>{" "}
          </div>{" "}
          <div className="p-6 space-y-4">
            {" "}
            {/* Subscription Item */}{" "}
            <div className="flex items-start justify-between pb-4 border-b border-slate-700">
              {" "}
              <div className="flex items-start gap-3">
                {" "}
                <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-2.5 rounded-lg flex-shrink-0">
                  {" "}
                  <Crown className="w-6 h-6 text-white" />{" "}
                </div>{" "}
                <div>
                  {" "}
                  <p className="text-white font-semibold">
                    FishingFinderUSA Pro
                  </p>{" "}
                  <p className="text-sm text-gray-400">
                    {" "}
                    {plan === "yearly" ? "Annual" : "Monthly"} Subscription{" "}
                  </p>{" "}
                  <p className="text-xs text-gray-500 mt-1">
                    {" "}
                    Billed {plan === "yearly" ? "annually" : "monthly"} ·
                    Auto-renews{" "}
                  </p>{" "}
                </div>{" "}
              </div>{" "}
              <p className="text-white font-bold text-lg">
                {planDetails.price}
              </p>{" "}
            </div>{" "}
            {/* Details */}{" "}
            <div className="grid grid-cols-2 gap-4 text-sm">
              {" "}
              <div>
                {" "}
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">
                  Account
                </p>{" "}
                <p className="text-white font-medium truncate">
                  {user?.email || "Loading..."}
                </p>{" "}
              </div>{" "}
              <div>
                {" "}
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">
                  Payment Method
                </p>{" "}
                <p className="text-white font-medium">Card via Stripe</p>{" "}
              </div>{" "}
              <div>
                {" "}
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">
                  Date
                </p>{" "}
                <p className="text-white font-medium">
                  {today.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>{" "}
              </div>{" "}
              <div>
                {" "}
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">
                  Next Renewal
                </p>{" "}
                <p className="text-white font-medium">
                  {renewDate.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>{" "}
              </div>{" "}
            </div>{" "}
            {/* Total */}{" "}
            <div className="pt-4 border-t border-slate-700 flex items-center justify-between">
              {" "}
              <span className="text-white font-semibold">
                Total Charged
              </span>{" "}
              <div className="text-right">
                {" "}
                <p className="text-2xl font-bold text-white">
                  {planDetails.price}
                </p>{" "}
                <p className="text-xs text-gray-400">USD · Paid in full</p>{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
        </div>{" "}
        {/* Email confirmation notice */}{" "}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-8 flex items-start gap-3">
          {" "}
          <Mail className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />{" "}
          <div>
            {" "}
            <p className="text-white font-medium text-sm">
              Receipt sent to your email
            </p>{" "}
            <p className="text-blue-200/70 text-sm mt-0.5">
              {" "}
              We've emailed a copy of your receipt to{" "}
              <span className="text-white font-medium">
                {user?.email || "your inbox"}
              </span>
              . Check your inbox or spam folder.{" "}
            </p>{" "}
          </div>{" "}
        </div>{" "}
        {/* Next Steps */}{" "}
        <div className="mb-8">
          {" "}
          <h2 className="text-2xl font-bold text-white mb-2">
            What's Next?
          </h2>{" "}
          <p className="text-gray-400 mb-6">
            Get the most out of your Pro membership
          </p>{" "}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {" "}
            {nextSteps.map((step, i) => (
              <div
                key={i}
                className="bg-slate-800/60 rounded-xl border border-slate-700 p-5 hover:border-amber-500/30 transition group"
              >
                {" "}
                <div className="flex items-start gap-3 mb-3">
                  {" "}
                  <div className="bg-amber-500/10 p-2 rounded-lg group-hover:bg-amber-500/20 transition">
                    {" "}
                    <step.icon className="w-5 h-5 text-amber-400" />{" "}
                  </div>{" "}
                  <div className="flex-1">
                    {" "}
                    <h3 className="text-white font-semibold mb-1">
                      {step.title}
                    </h3>{" "}
                    <p className="text-sm text-gray-400">{step.desc}</p>{" "}
                  </div>{" "}
                </div>{" "}
                <Button
                  onClick={step.action}
                  variant="ghost"
                  className="w-full justify-between text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 mt-2"
                >
                  {" "}
                  {step.cta} <ArrowRight className="w-4 h-4" />{" "}
                </Button>{" "}
              </div>
            ))}{" "}
          </div>{" "}
        </div>{" "}
        {/* CTA */}{" "}
        <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-2xl border border-amber-500/30 p-8 text-center">
          {" "}
          <h3 className="text-2xl font-bold text-white mb-3">
            Ready to Start Fishing?
          </h3>{" "}
          <p className="text-gray-300 mb-6 max-w-lg mx-auto">
            {" "}
            Your Pro features are now active. Jump into the app and start
            exploring.{" "}
          </p>{" "}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {" "}
            <Button
              onClick={() => navigate("/")}
              size="lg"
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold px-8 py-6 text-lg rounded-xl"
            >
              {" "}
              Start Exploring <ArrowRight className="w-5 h-5 ml-2" />{" "}
            </Button>{" "}
            <Button
              onClick={() => navigate("/my-trips")}
              variant="outline"
              size="lg"
              className="border-slate-600 text-gray-200 hover:bg-slate-700 px-8 py-6 text-lg rounded-xl"
            >
              {" "}
              <Calendar className="w-5 h-5 mr-2" /> Plan First Trip{" "}
            </Button>{" "}
          </div>{" "}
        </div>{" "}
        {/* Support */}{" "}
        <div className="mt-8 text-center text-sm text-gray-400">
          {" "}
          <p>
            {" "}
            Questions about your subscription?{" "}
            <button
              onClick={() => navigate("/pricing")}
              className="text-amber-400 hover:text-amber-300 underline"
            >
              {" "}
              View billing details{" "}
            </button>{" "}
          </p>{" "}
        </div>{" "}
      </div>{" "}
      {/* Footer */}{" "}
      <footer className="bg-slate-900 border-t border-blue-500/20 py-6 mt-8">
        {" "}
        <div className="max-w-7xl mx-auto px-4 text-center text-blue-300 text-sm">
          {" "}
          <p>&copy; 2026 FishingFinderUSA. All rights reserved.</p>{" "}
        </div>{" "}
      </footer>{" "}
    </div>
  );
};
export default CheckoutSuccess;

