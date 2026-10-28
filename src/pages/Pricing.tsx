import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
// import { getPublicFishingSpots } from '@/services/fishingData';
import { getPublicFishingSpots } from '@/data/fishingSpots';

import { supabase } from '@/lib/supabase';
import { isSubscriptionEntitled } from '@/data/fishingSpots';
import { isIosMedianApp, isAndroidMedianApp, IapPlan, IAP_PRODUCT_IDS, requestAndroidGooglePlayIap } from '@/lib/utils';
import AuthModal from '@/components/AuthModal';
import SubscriptionModal, { AndroidIapModal, AppleIapModal } from '@/components/SubscriptionModal';
import StripeDebugPanel from '@/components/StripeDebugPanel';
import ManageBillingButton from '@/components/ManageBillingButton';
import PaymentMethodsSection from '@/components/PaymentMethodsSection';

import {
  Fish, Crown, Check, X, ArrowLeft, Zap, Shield, Star,
  MapPin, Camera, Calendar, Cloud, Hotel, BookOpen, Headphones, Heart,
  Users, TreePine, Compass, Tent, Sun, Award, Waves, Lock
} from 'lucide-react';


const Pricing: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showAppleIapModal, setShowAppleIapModal] = useState(false);
  const [showAndroidIapModal, setShowAndroidIapModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<IapPlan>('yearly');
  const [postAuthGoProPlan, setPostAuthGoProPlan] = useState<IapPlan | null>(null);
  const [isIosMedian, setIsIosMedian] = useState(false);
  const [isAndroidMedian, setIsAndroidMedian] = useState(false);
  const [totalSpots, setTotalSpots] = useState(0);

  useEffect(() => {
    getPublicFishingSpots().then((spots) => setTotalSpots(spots.length)).catch(() => setTotalSpots(0));
  }, []);

  // Debug panel: visible in dev mode OR when ?debug=1 is in the URL
  const showDebugPanel = (() => {
    if (typeof window === 'undefined') return false;
    if (import.meta.env.DEV) return true;
    try {
      return new URLSearchParams(window.location.search).get('debug') === '1';
    } catch {
      return false;
    }
  })();



  const syncNativeIapState = () => {
    setIsIosMedian(isIosMedianApp());
    setIsAndroidMedian(isAndroidMedianApp());
  };

  useEffect(() => {
    syncNativeIapState();

    const refreshNativeState = () => syncNativeIapState();
    window.addEventListener('load', refreshNativeState);
    window.addEventListener('median_library_ready', refreshNativeState as EventListener);
    window.addEventListener('gonative_library_ready', refreshNativeState as EventListener);

    const timer = window.setTimeout(refreshNativeState, 800);

    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        const { data } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', session.user.id)
          .in('status', ['active', 'trialing']);
        const activeSubscription = (data || []).find(isSubscriptionEntitled);
        if (activeSubscription) setSubscription(activeSubscription);
      }
    };
    checkAuth();

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
        setSubscription(null);
      }
    });

    return () => {
      authSub.unsubscribe();
      window.clearTimeout(timer);
      window.removeEventListener('load', refreshNativeState);
      window.removeEventListener('median_library_ready', refreshNativeState as EventListener);
      window.removeEventListener('gonative_library_ready', refreshNativeState as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isAndroidMedian || !user || subscription) return;
    setSelectedPlan('yearly');
    setShowAndroidIapModal(true);
  }, [isAndroidMedian, user, subscription]);

  const handleUpgradeClick = (planOverride?: IapPlan) => {
    const plan = planOverride || selectedPlan;
    const nativeIos = isIosMedianApp();
    const nativeAndroid = isAndroidMedianApp();

    if (!user) {
      setSelectedPlan(plan);
      setPostAuthGoProPlan(plan);
      setShowAuthModal(true);
      return;
    }

    if (nativeIos) {
      setSelectedPlan(plan);
      setShowAppleIapModal(true);
      return;
    }

    if (nativeAndroid) {
      setSelectedPlan(plan);
      setShowAndroidIapModal(true);
      return;
    }

    navigate(`/checkout?plan=${plan}`);
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    if (!postAuthGoProPlan) return;
    const nativeIos = isIosMedianApp();
    const nativeAndroid = isAndroidMedianApp();
    if (nativeIos) {
      setSelectedPlan(postAuthGoProPlan);
      setShowAppleIapModal(true);
    } else if (nativeAndroid) {
      setSelectedPlan(postAuthGoProPlan);
      setShowAndroidIapModal(true);
    } else {
      navigate(`/checkout?plan=${postAuthGoProPlan}`);
    }
    setPostAuthGoProPlan(null);
  };


  // const totalSpots = fishingSpots.length;

  const guestFeatures = [
    { text: 'Search up to 5 fishing spots', included: true },
    { text: 'View species for those 5 spots', included: true },
    { text: 'Preview app experience', included: true },
    { text: 'View fishing regulations', included: true },
    { text: 'Browse fish species guide', included: true },
    { text: `Search all ${totalSpots}+ fishing spots`, included: false },
    { text: 'Save favorite spots', included: false },
    { text: 'Catch log with photos', included: false },
    { text: 'Trip planner & sharing', included: false },
    { text: 'Weather forecasts', included: false },
    { text: 'Lodging reviews', included: false },
    { text: 'Priority support', included: false },
  ];

  const proFeatures = [
    { text: `Search all ${totalSpots}+ fishing spots`, included: true },
    { text: 'View all species & detailed info', included: true },
    { text: 'Full app experience', included: true },
    { text: 'View fishing regulations', included: true },
    { text: 'Browse fish species guide', included: true },
    { text: 'Unlimited favorite spots', included: true },
    { text: 'Catch log with photos', included: true },
    { text: 'Trip planner & sharing', included: true },
    { text: 'Weather forecasts', included: true },
    { text: 'Lodging reviews', included: true },
    { text: 'Priority support', included: true },
  ];


  const proHighlights = [
    { icon: Heart, title: 'Unlimited Favorites', desc: 'Save as many fishing spots as you want' },
    { icon: Camera, title: 'Photo Catch Log', desc: 'Track every catch with photos and stats' },
    { icon: Calendar, title: 'Trip Planner', desc: 'Plan trips and share with friends & family' },
    { icon: Cloud, title: 'Weather Data', desc: 'Real-time weather for every spot' },
    { icon: Hotel, title: 'Lodging Reviews', desc: 'Read and write accommodation reviews' },
    { icon: BookOpen, title: 'Species Guide', desc: 'Full encyclopedia of fish species' },
    { icon: MapPin, title: 'GPS Directions', desc: 'Navigate directly to fishing spots' },
    { icon: Headphones, title: 'Priority Support', desc: 'Get help when you need it' },
  ];

  const familyBenefits = [
    {
      icon: Users,
      title: 'Quality Family Time',
      desc: 'Unplug from screens and reconnect with your loved ones in the great outdoors. Fishing creates uninterrupted bonding time that strengthens family relationships.',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      icon: TreePine,
      title: 'Teach Kids About Nature',
      desc: 'Introduce your children to wildlife, ecosystems, and conservation. Fishing teaches patience, responsibility, and respect for the environment.',
      color: 'from-green-500 to-emerald-500',
    },
    {
      icon: Compass,
      title: 'Discover New Adventures',
      desc: `With ${totalSpots}+ spots across all 50 states, every weekend can be a new adventure. Explore lakes, rivers, and coastlines you never knew existed.`,
      color: 'from-amber-500 to-orange-500',

    },
    {
      icon: Camera,
      title: 'Create Lasting Memories',
      desc: 'Log your catches with photos, plan trips together, and build a family fishing journal that you\'ll treasure for years to come.',
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: Sun,
      title: 'Health & Wellness',
      desc: 'Fishing reduces stress, improves mental health, and gets the whole family active outdoors. Fresh air and sunshine are the best medicine.',
      color: 'from-yellow-500 to-orange-400',
    },
    {
      icon: Award,
      title: 'Build Life Skills',
      desc: 'Kids learn patience, problem-solving, and perseverance through fishing. These skills transfer to school, sports, and life.',
      color: 'from-red-500 to-rose-500',
    },
    {
      icon: Tent,
      title: 'Affordable Recreation',
      desc: 'Fishing is one of the most affordable outdoor activities. A Pro membership gives your whole family access to the best spots and planning tools.',
      color: 'from-teal-500 to-cyan-500',
    },
    {
      icon: Waves,
      title: 'Learn Conservation',
      desc: 'Teach your family about catch-and-release, sustainable fishing practices, and protecting our waterways for future generations.',
      color: 'from-indigo-500 to-blue-500',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button onClick={() => navigate('/')} variant="ghost" className="text-blue-200 hover:text-white hover:bg-blue-500/20 md:hidden flex">
            <ArrowLeft className="w-4 h-4" />
          </Button>
            <button onClick={() => navigate('/')} className="flex items-center gap-3 hover:opacity-80 transition">
              <div className="p-2 rounded-lg">
                <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">FishingFinderUSA</h1>
                <p className="text-blue-300 text-sm">Find fishing spots in all 50 states</p>
              </div>
            </button>
          </div>
          <Button onClick={() => navigate('/')} variant="ghost" className="text-blue-200 hover:text-white hover:bg-blue-500/20 hidden md:inline-flex">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to App
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 md:py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-5 py-2 mb-8">
            <Crown className="w-4 h-4 text-amber-400" />
            <span className="text-amber-300 text-sm font-medium">Upgrade to Pro</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Take Your Fishing
            <br />
            <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400 bg-clip-text text-transparent">
              To The Next Level
            </span>
          </h2>
          <p className="text-xl text-blue-200/80 max-w-2xl mx-auto">
            Get unlimited access to all premium features. Plan better trips, log more catches, and discover the best fishing spots across America — for you and your whole family.
          </p>
        </div>
      </section>
      {/* Stripe Debug Panel — visible in dev mode or with ?debug=1 */}
      {showDebugPanel && <StripeDebugPanel />}

      {/* Active Subscriber Banner — gives Pro members a one-click button to
          open Stripe's Customer Portal where they can update payment methods,
          download invoices, switch plans, or cancel. */}
      {subscription?.stripe_customer_id && (
        <section className="max-w-5xl mx-auto px-4 mb-10">
          <div className="bg-gradient-to-r from-emerald-500/10 via-green-500/10 to-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/20">
                <Crown className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg mb-1">
                  You're a Pro Member
                  {subscription.plan && (
                    <span className="ml-2 text-sm text-emerald-300 font-normal">
                      ({subscription.plan})
                    </span>
                  )}
                </h3>
                <p className="text-emerald-100/80 text-sm leading-relaxed">
                  Update your payment method, download invoices, switch plans, or cancel your subscription — all managed securely through Stripe.
                </p>
              </div>
            </div>
            <ManageBillingButton
              customerId={subscription.stripe_customer_id}
              variant="default"
              className="bg-white text-emerald-700 hover:bg-emerald-50 font-semibold shadow-lg whitespace-nowrap"
            />
          </div>
        </section>
      )}

      {/* Payment Methods (saved cards) — only shown to authenticated users */}
      {user && !isIosMedian && !isAndroidMedian && (
        <PaymentMethodsSection
          userId={user.id}
          userEmail={user.email}
          customerId={subscription?.stripe_customer_id || undefined}
        />
      )}


      {/* Pricing Cards */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Guest Member Plan */}
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-white">Guest Member</h3>
                <div className="bg-slate-600/50 rounded-full px-2 py-0.5">
                  <span className="text-xs text-gray-400 font-medium">LIMITED</span>
                </div>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-white">$0</span>
                <span className="text-gray-400">/forever</span>
              </div>
              <p className="text-sm text-gray-400 mt-2">Preview what FishingFinderUSA offers</p>
            </div>
            <Button
              onClick={() => navigate('/')}
              variant="outline"
              className="w-full border-slate-600 text-gray-300 hover:bg-slate-700 py-5 mb-6 bg-inherit"
            >
              {!user ? 'Current Access' : 'Guest Access'}
            </Button>

            {/* Guest Limitation Notice */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-5">
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-200/80">
                  As a guest, you can explore <span className="font-semibold text-amber-300">5 fishing spots</span> and see their species. Upgrade to Pro to unlock all {totalSpots}+ spots and premium features!
                </p>

              </div>
            </div>

            <ul className="space-y-3">
              {guestFeatures.map((feature, i) => (
                <li key={i} className="flex items-center gap-3">
                  {feature.included ? (
                    <div className="w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-green-400" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0">
                      <X className="w-3 h-3 text-gray-500" />
                    </div>
                  )}
                  <span className={`text-sm ${feature.included ? 'text-gray-300' : 'text-gray-500'}`}>
                    {feature.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Monthly Pro */}
          <div className="bg-slate-800/50 rounded-2xl border border-blue-500/30 p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                Pro Monthly
                <Crown className="w-4 h-4 text-amber-400" />
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-white">$9.99</span>
                <span className="text-gray-400">/month</span>
              </div>
              <p className="text-sm text-gray-400 mt-2">Billed monthly</p>
            </div>
            <Button
              onClick={() => {
                setSelectedPlan('monthly');
                handleUpgradeClick('monthly');
              }}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-5 mb-6"
              disabled={!!subscription}
            >
              {subscription ? 'Already Subscribed' : 'Get Monthly Pro'}
            </Button>
            <ul className="space-y-3">
              {proFeatures.map((feature, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-green-400" />
                  </div>
                  <span className="text-sm text-gray-300">{feature.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Yearly Pro */}
          <div className="relative bg-gradient-to-b from-amber-500/10 to-slate-800/50 rounded-2xl border-2 border-amber-500/50 p-6">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold px-4 py-1.5 rounded-full">
              BEST VALUE — Save 33%
            </div>
            <div className="mb-6 mt-2">
              <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                Pro Yearly
                <Crown className="w-4 h-4 text-amber-400" />
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-white">$79.99</span>
                <span className="text-gray-400">/year</span>
              </div>
              <p className="text-sm text-green-400 mt-2 font-medium">Just $6.67/month — 2 months free!</p>
            </div>
            <Button
              onClick={() => {
                setSelectedPlan('yearly');
                handleUpgradeClick('yearly');
              }}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-5 mb-6 shadow-lg shadow-amber-500/20"
              disabled={!!subscription}
            >
              {subscription ? 'Already Subscribed' : 'Get Yearly Pro'}
            </Button>
            <ul className="space-y-3">
              {proFeatures.map((feature, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-green-400" />
                  </div>
                  <span className="text-sm text-gray-300">{feature.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Guest vs Pro Comparison Banner */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div className="bg-gradient-to-r from-slate-800/80 to-blue-900/40 rounded-2xl border border-blue-500/20 p-8 md:p-10">
          <div className="text-center mb-8">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">Guest Member vs Pro Member</h3>
            <p className="text-blue-200/70 text-lg">See what you're missing as a guest</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Guest Side */}
            <div className="bg-slate-800/60 rounded-xl p-6 border border-slate-600">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center">
                  <Users className="w-5 h-5 text-gray-300" />
                </div>
                <div>
                  <h4 className="text-white font-semibold">Guest Member</h4>
                  <p className="text-gray-400 text-sm">Limited preview</p>
                </div>
              </div>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-sm text-gray-300">
                  <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <span>Only <span className="text-amber-400 font-semibold">5 fishing spots</span> visible</span>
                </li>
                <li className="flex items-center gap-3 text-sm text-gray-300">
                  <Fish className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <span>Species info for those 5 spots only</span>
                </li>
                <li className="flex items-center gap-3 text-sm text-gray-300">
                  <Lock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <span>No favorites, catch log, or trip planner</span>
                </li>
                <li className="flex items-center gap-3 text-sm text-gray-300">
                  <Lock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <span>No weather data or lodging reviews</span>
                </li>
              </ul>
            </div>
            {/* Pro Side */}
            <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 rounded-xl p-6 border border-amber-500/30">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center">
                  <Crown className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="text-white font-semibold">Pro Member</h4>
                  <p className="text-amber-300 text-sm">Full access</p>
                </div>
              </div>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-sm text-gray-200">
                  <MapPin className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>All <span className="text-amber-400 font-semibold">{totalSpots}+ fishing spots</span> unlocked</span>
                </li>
                <li className="flex items-center gap-3 text-sm text-gray-200">

                  <Fish className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>Complete species info, bait & techniques</span>
                </li>
                <li className="flex items-center gap-3 text-sm text-gray-200">
                  <Heart className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>Unlimited favorites, catch log & trip planner</span>
                </li>
                <li className="flex items-center gap-3 text-sm text-gray-200">
                  <Cloud className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>Weather data, lodging reviews & priority support</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Family Benefits Section */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-5 py-2 mb-6">
            <Users className="w-4 h-4 text-green-400" />
            <span className="text-green-300 text-sm font-medium">For You & Your Family</span>
          </div>
          <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Why Join FishingFinderUSA?
          </h3>
          <p className="text-blue-200/70 text-lg max-w-2xl mx-auto">
            It's more than just finding fishing spots — it's about creating unforgettable experiences with the people who matter most. Here's what's in store for you and your family.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {familyBenefits.map((benefit, i) => (
            <div key={i} className="bg-slate-800/50 rounded-xl p-6 border border-slate-700 hover:border-green-500/30 transition-all group hover:transform hover:scale-[1.02]">
              <div className={`w-12 h-12 bg-gradient-to-br ${benefit.color} rounded-xl flex items-center justify-center mb-4 shadow-lg group-hover:shadow-xl transition`}>
                <benefit.icon className="w-6 h-6 text-white" />
              </div>
              <h4 className="text-white font-semibold mb-2 text-lg">{benefit.title}</h4>
              <p className="text-sm text-gray-400 leading-relaxed">{benefit.desc}</p>
            </div>
          ))}
        </div>

        {/* Family CTA */}
        <div className="mt-12 bg-gradient-to-r from-green-500/10 via-blue-500/10 to-green-500/10 rounded-2xl border border-green-500/20 p-8 md:p-10 text-center">
          <div className="max-w-2xl mx-auto">
            <Users className="w-10 h-10 text-green-400 mx-auto mb-4" />
            <h4 className="text-2xl font-bold text-white mb-3">
              The Best Gift for Your Family
            </h4>
            <p className="text-gray-300 mb-6 leading-relaxed">
              For less than the cost of a single fishing lure, give your family unlimited access to America's best fishing spots. 
              Plan weekend adventures, track your catches together, and build a lifetime of outdoor memories — all starting at just <span className="text-amber-400 font-semibold">$6.67/month</span>.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button
                onClick={() => {
                  setSelectedPlan('yearly');
                  handleUpgradeClick();
                }}
                size="lg"
                className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold px-8 py-6 text-lg rounded-xl shadow-lg shadow-green-500/20"
                disabled={!!subscription}
              >
                <Users className="w-5 h-5 mr-2" />
                {subscription ? 'You\'re a Pro Member!' : 'Join for Your Family'}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold text-white mb-4">Everything You Need to Fish Smarter</h3>
          <p className="text-blue-200/70 text-lg">Pro members get access to all these premium features</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {proHighlights.map((item, i) => (
            <div key={i} className="bg-slate-800/50 rounded-xl p-6 border border-slate-700 hover:border-amber-500/30 transition-all group">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition">
                <item.icon className="w-6 h-6 text-amber-400" />
              </div>
              <h4 className="text-white font-semibold mb-2">{item.title}</h4>
              <p className="text-sm text-gray-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust Section */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700 px-4 py-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield className="w-8 h-8 text-green-400" />
            <h3 className="text-lg md:text-2xl font-bold text-white">100% Satisfaction Guaranteed</h3>
          </div>
          <p className="text-gray-400 max-w-xl mx-auto mb-6">
            Try Pro risk-free. If you're not completely satisfied within the first 30 days, we'll give you a full refund. No questions asked.
          </p>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-400" />
              <span>Secure payments via Stripe</span>
            </div>
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400" />
              <span>Cancel anytime</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-400" />
              <span>Instant access</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 pb-20">
        <h3 className="text-2xl font-bold text-white text-center mb-8">Frequently Asked Questions</h3>
        <div className="space-y-4">
          {[
            {
              q: 'What can I do as a Guest Member?',
              a: `As a Guest Member, you can explore up to 5 fishing spots and see the fish species associated with those spots. It's a great way to experience what FishingFinderUSA has to offer before upgrading to Pro for full access to all ${totalSpots}+ spots and premium features.`,
            },

            {
              q: 'Can I cancel my subscription anytime?',
              a: 'Yes! You can cancel your subscription at any time from your account settings. Your access will continue until the end of your current billing period.',
            },
            {
              q: 'What payment methods do you accept?',
              a: 'We accept all major credit and debit cards (Visa, Mastercard, American Express, Discover) through our secure Stripe payment processor.',
            },
            {
              q: 'Is there a free trial?',
              a: 'We offer a Guest Member experience so you can preview the app, plus a 30-day money-back guarantee on Pro. If you\'re not satisfied with Pro, contact us within 30 days for a full refund.',
            },
            {
              q: 'Can my whole family use one account?',
              a: 'Yes! One Pro subscription gives you full access to plan family trips, log catches together, and explore fishing spots as a family. It\'s designed for the whole household to enjoy.',
            },
            {
              q: 'Can I switch between monthly and yearly plans?',
              a: 'Yes, you can switch between plans at any time. If you upgrade from monthly to yearly, you\'ll receive a prorated credit.',
            },
            {
              q: 'What happens to my data if I cancel?',
              a: 'Your data (catches, trips, favorites) is always yours. If you cancel, you\'ll retain read-only access to your saved data.',
            },
          ].map((faq, i) => (
            <details key={i} className="bg-slate-800/50 rounded-xl border border-slate-700 group">
              <summary className="p-5 cursor-pointer text-white font-medium hover:text-amber-400 transition list-none flex items-center justify-between">
                {faq.q}
                <svg className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-5 pb-5 text-gray-400 text-sm leading-relaxed">{faq.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-2xl border border-amber-500/30 p-8 md:p-12 text-center">
          <Crown className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h3 className="text-3xl font-bold text-white mb-4">Ready to Go Pro?</h3>
          <p className="text-gray-300 mb-8 max-w-lg mx-auto">
            Join thousands of anglers who use FishingFinderUSA Pro to plan better trips, catch more fish, and create lasting family memories.
          </p>
          <Button
            onClick={() => handleUpgradeClick()}
            size="lg"
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold px-10 py-6 text-md md:text-lg rounded-xl shadow-lg shadow-amber-500/20"
            disabled={!!subscription}
          >
            {subscription ? 'You\'re Already a Pro Member!' : 'Start Your Pro Subscription'}
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-blue-500/20 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-blue-300 text-sm">
          <p>&copy; 2026 FishingFinderUSA. All rights reserved. Payments processed securely by Stripe.</p>
        </div>
      </footer>

      {/* Auth Modal */}
      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        onSubscribed={() => {
          setShowSubscriptionModal(false);
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
              supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', session.user.id)
                .in('status', ['active', 'trialing'])
                .then(({ data }) => {
                  const activeSubscription = (data || []).find(isSubscriptionEntitled);
                  if (activeSubscription) setSubscription(activeSubscription);
                });
            }
          });
        }}
        userEmail={user?.email}
        userName={user?.user_metadata?.display_name}
      />

      <AppleIapModal
        isOpen={showAppleIapModal}
        onClose={() => setShowAppleIapModal(false)}
        onSuccess={() => {
          setShowAppleIapModal(false);
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
              setUser(session.user);
            }
          });
        }}
        userId={user?.id ?? null}
        userEmail={user?.email ?? undefined}
        defaultPlan={selectedPlan}
      />

      <AndroidIapModal
        isOpen={showAndroidIapModal}
        onClose={() => setShowAndroidIapModal(false)}
        onSuccess={() => {
          setShowAndroidIapModal(false);
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
              setUser(session.user);
            }
          });
        }}
        defaultPlan={selectedPlan}
      />
    </div>
  );
};

export default Pricing;
