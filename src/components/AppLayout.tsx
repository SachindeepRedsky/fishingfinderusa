import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, MapPin, Fish, DollarSign, Waves, TreePine, Anchor, Building, Droplets, Heart, User, LogOut, Star, ChevronDown, BookOpen, Calendar, Lightbulb, ChevronRight, X, Hotel, Tent, Scroll, Scale, Crown, CreditCard, Lock, Users, Shield, Camera, Compass, Sun, Award, Map, LayoutGrid, Navigation, QrCode, Share2, Trash2, Loader2, Mail, Home, BadgeAlertIcon, Trophy, LayoutDashboard } from 'lucide-react';




import { supabase } from '@/lib/supabase';
import { expireUserSubscriptions, isSubscriptionEntitled } from '@/data/fishingSpots';
import { isIosMedianApp, isAndroidMedianApp, IapPlan, requestAndroidGooglePlayIap } from '@/lib/utils';
import AuthModal from '@/components/AuthModal';
import SubscriptionModal, { AndroidIapModal, AppleIapModal } from '@/components/SubscriptionModal';
import AccommodationsSection from '@/components/AccommodationsSection';
import FishSpeciesSpotSection from '@/components/FishSpeciesSpotSection';
import TripPlannerModal from '@/components/TripPlannerModal';
import WeatherWidget from '@/components/WeatherWidget';
import FishingMapView from '@/components/FishingMapView';
import SpotShareDialog from '@/components/SpotShareDialog';
import { getPublicFishingSpots, isCurrentUserAdmin, states, waterTypes, FishingSpot } from '@/data/fishingSpots';
import { calculateDistance, formatDistance } from '@/data/spotCoordinates';




import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

const heroImage = "https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771299630710_620f441d.png";

const GUEST_SPOT_LIMIT = 5;

interface UserProfile {
  id: string;
  email: string;
  display_name: string;
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'lake': return <Waves className="w-4 h-4" />;
    case 'river': return <TreePine className="w-4 h-4" />;
    case 'ocean': return <Anchor className="w-4 h-4" />;
    case 'dam': return <Droplets className="w-4 h-4" />;
    case 'private': return <Building className="w-4 h-4" />;
    case 'pay-lake': return <DollarSign className="w-4 h-4" />;
    default: return <Fish className="w-4 h-4" />;
  }
};

const getTypeColor = (type: string) => {
  switch (type) {
    case 'lake': return 'bg-blue-500';
    case 'river': return 'bg-green-500';
    case 'ocean': return 'bg-cyan-600';
    case 'dam': return 'bg-slate-600';
    case 'private': return 'bg-purple-500';
    case 'pay-lake': return 'bg-amber-500';
    default: return 'bg-gray-500';
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'lake': return 'Lake';
    case 'river': return 'River';
    case 'ocean': return 'Ocean/Bay';
    case 'dam': return 'Dam';
    case 'private': return 'Private';
    case 'pay-lake': return 'Pay Lake';
    default: return type;
  }
};

const getSeasonColor = (season: string) => {
  if (season.toLowerCase().includes('spring')) return 'text-green-400';
  if (season.toLowerCase().includes('summer')) return 'text-yellow-400';
  if (season.toLowerCase().includes('fall')) return 'text-orange-400';
  if (season.toLowerCase().includes('winter')) return 'text-blue-300';
  return 'text-blue-200';
};


const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedState, setSelectedState] = useState('All States');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedSpot, setSelectedSpot] = useState<FishingSpot | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [loadingFavorites, setLoadingFavorites] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(24);
  const [showTripPlanner, setShowTripPlanner] = useState(false);
  const [tripPlannerSpot, setTripPlannerSpot] = useState<FishingSpot | null>(null);
  const [isProUser, setIsProUser] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const { toast } = useToast();
  const [isIosMedian, setIsIosMedian] = useState(false);
  const [isAndroidMedian, setIsAndroidMedian] = useState(false);
  const [showAppleIapModal, setShowAppleIapModal] = useState(false);
  const [fishingSpots, setFishingSpots] = useState<FishingSpot[]>([]);
  const [showAndroidIapModal, setShowAndroidIapModal] = useState(false);
  const [appleIapPlan, setAppleIapPlan] = useState<IapPlan>('yearly');
  const [androidIapPlan, setAndroidIapPlan] = useState<IapPlan>('yearly');
  const [postAuthGoProPlan, setPostAuthGoProPlan] = useState<IapPlan | null>(null);
  const spotCoordinates = useMemo(() => Object.fromEntries(fishingSpots.map((spot) => [spot.id, { lat: spot.latitude, lng: spot.longitude }])), [fishingSpots]);
  const syncNativeIapState = () => {
    setIsIosMedian(isIosMedianApp());
    setIsAndroidMedian(isAndroidMedianApp());
  };

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAdmin = async (userId?: string) => {
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    try {
      setIsAdmin(await isCurrentUserAdmin(userId));
    } catch {
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      setLoading(true);
      try {
        const [spots, session] = await Promise.all([
          getPublicFishingSpots(),
          supabase.auth.getSession().then(({ data }) => data.session),
        ]);

        if (cancelled) return;
        setFishingSpots(spots);
        await checkAdmin(session?.user?.id);
      } catch {
        if (!cancelled) {
          setFishingSpots([]);
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadInitialData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user?.id) checkAdmin(user.id);
    else setIsAdmin(false);
  }, [user?.id]);


  useEffect(() => {
    syncNativeIapState();

    const refreshNativeState = () => syncNativeIapState();
    window.addEventListener('load', refreshNativeState);
    window.addEventListener('median_library_ready', refreshNativeState as EventListener);
    window.addEventListener('gonative_library_ready', refreshNativeState as EventListener);

    const timer = window.setTimeout(refreshNativeState, 800);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('load', refreshNativeState);
      window.removeEventListener('median_library_ready', refreshNativeState as EventListener);
      window.removeEventListener('gonative_library_ready', refreshNativeState as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isAndroidMedian || !user || isProUser) return;
    setAndroidIapPlan('yearly');
  }, [isAndroidMedian, user, isProUser]);

  // Deep-link: read ?spot=<id> on mount and auto-open that spot's detail modal.
  // This makes QR-shared URLs like https://fishingfinderusa.com/?spot=42
  // open directly to the relevant spot.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('spot');
      if (!raw) return;
      const spotId = parseInt(raw, 10);
      if (Number.isNaN(spotId)) return;
      const target = fishingSpots.find((s) => s.id === spotId);
      if (target) {
        setSelectedSpot(target);
        // Clean the param out of the URL so closing the modal and re-sharing
        // doesn't keep re-opening it on every navigation.
        params.delete('spot');
        const newSearch = params.toString();
        const newUrl =
          window.location.pathname +
          (newSearch ? `?${newSearch}` : '') +
          window.location.hash;
        window.history.replaceState({}, '', newUrl);
      }
    } catch {
      // ignore — non-fatal
    }
  }, [fishingSpots]);


  // Request user location for distance display
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => { /* silently fail */ },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
      );
    }
  }, []);


  // Determine if user is a guest (not logged in or not pro)
  const isGuest = !user;
  const isLimitedUser = !isProUser; // logged in but not pro - still gets full spot access but limited features

  // Check subscription status — reads from the `subscriptions` table that the
  // stripe-webhook edge function keeps in sync. 'active' or 'trialing' = Pro.
  const checkSubscription = async (userId: string) => {
    try {
      await expireUserSubscriptions(userId);
    } catch (error) {
      console.error('Unable to expire ended subscriptions:', error);
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .select('status, plan, current_period_end')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .order('updated_at', { ascending: false })
    if (error) {
      console.error('Unable to check subscription status:', error.message);
      setIsProUser(false);
      return;
    }
    const hasProAccess = (data || []).some(isSubscriptionEntitled);
    setIsProUser(hasProAccess);
    if (!hasProAccess) setShowFavoritesOnly(false);
  };


  useEffect(() => {
    // We intentionally DO NOT use supabase Realtime channels here.
    // The hosted backend's Realtime websocket can deliver malformed binary
    // frames that the supabase-js Phoenix decoder fails on with
    //   "TypeError: n is not iterable"
    // (the decoder expects an array but receives something else).
    // To keep checkout robust, we use a lightweight polling approach instead.
    let pollTimer: number | undefined;

    const startPolling = (userId: string) => {
      // Poll every 5s for subscription status changes (covers webhook upserts)
      if (pollTimer) window.clearInterval(pollTimer);
      pollTimer = window.setInterval(() => {
        checkSubscription(userId);
      }, 5000);
    };

    const stopPolling = () => {
      if (pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };

    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        fetchUserProfile(session.user.id);
        fetchFavorites(session.user.id);
        checkSubscription(session.user.id);
        startPolling(session.user.id);
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        fetchUserProfile(session.user.id);
        fetchFavorites(session.user.id);
        checkSubscription(session.user.id);
        startPolling(session.user.id);
      } else {
        setUser(null);
        setUserProfile(null);
        setFavorites([]);
        setShowFavoritesOnly(false);
        setIsProUser(false);
        stopPolling();
      }
    });

    // Refresh subscription status when user returns to the tab
    // (e.g., after completing Stripe checkout in another tab)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) checkSubscription(session.user.id);
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      subscription.unsubscribe();
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const FullLoading = () => (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-blue-200">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      Loading fishing spots and account...
    </div>
  );

  const fetchUserProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) setUserProfile(data);
  };

  const fetchFavorites = async (userId: string) => {
    const { data } = await supabase
      .from('favorites')
      .select('spot_id')
      .eq('user_id', userId);
    if (data) setFavorites(data.map(f => f.spot_id));
  };

  const toggleFavorite = async (spotId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) { setShowAuthModal(true); return; }
    if (!isProUser) { setShowSubscriptionModal(true); return; }
    setLoadingFavorites(spotId);
    const isFavorite = favorites.includes(spotId);
    if (isFavorite) {
      await supabase.from('favorites').delete().eq('user_id', user.id).eq('spot_id', spotId);
      setFavorites(favorites.filter(id => id !== spotId));
    } else {
      await supabase.from('favorites').insert({ user_id: user.id, spot_id: spotId });
      setFavorites([...favorites, spotId]);
    }
    setLoadingFavorites(null);
  };

  const openFavorites = () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (!isProUser) {
      setShowSubscriptionModal(true);
      return;
    }
    setShowFavoritesOnly(true);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUserProfile(null);
    setFavorites([]);
    setShowFavoritesOnly(false);
  };

  const handleGoProAction = (plan: IapPlan = 'yearly') => {
    const nativeIos = isIosMedianApp();
    const nativeAndroid = isAndroidMedianApp();

    if (!user) {
      setPostAuthGoProPlan(plan);
      setShowAuthModal(true);
      return;
    }
    if (nativeIos) {
      setAppleIapPlan(plan);
      setShowAppleIapModal(true);
      return;
    }
    if (nativeAndroid) {
      setAndroidIapPlan(plan);
      setShowAndroidIapModal(true);
      return;
    }
    setShowSubscriptionModal(true);
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    if (postAuthGoProPlan) {
      const nativeIos = isIosMedianApp();
      const nativeAndroid = isAndroidMedianApp();
      if (nativeIos) {
        setAppleIapPlan(postAuthGoProPlan);
        setShowAppleIapModal(true);
      } else if (nativeAndroid) {
        setAndroidIapPlan(postAuthGoProPlan);
        setShowAndroidIapModal(true);
      } else {
        setShowSubscriptionModal(true);
      }
      setPostAuthGoProPlan(null);
    }
  };

  // Permanently deletes the user's account + all associated data.
  // Required for Apple App Store guideline 5.1.1(v).
  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const { data, error } = await supabase.functions.invoke('delete-account', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error || (data && data.error)) {
        throw new Error((data && data.error) || error?.message || 'Failed to delete account');
      }
      toast({
        title: 'Account deleted',
        description: 'Your account and all associated data have been permanently removed.',
      });
      await supabase.auth.signOut();
      setUser(null);
      setUserProfile(null);
      setFavorites([]);
      setShowFavoritesOnly(false);
      setIsProUser(false);
      setShowDeleteDialog(false);
    } catch (e: any) {
      toast({
        title: 'Could not delete account',
        description: e?.message || 'Something went wrong. Please try again or contact support.',
        variant: 'destructive',
      });
    } finally {
      setDeletingAccount(false);
    }
  };

  const matchingSpots = useMemo(() => {
    let spots = fishingSpots;
    if (showFavoritesOnly) spots = spots.filter(spot => favorites.includes(spot.id));
    return spots.filter(spot => {
      const matchesSearch = searchQuery === '' ||
        spot.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        spot.fish.some(f => f.toLowerCase().includes(searchQuery.toLowerCase())) ||
        spot.state.toLowerCase().includes(searchQuery.toLowerCase()) ||
        spot.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesState = selectedState === 'All States' || spot.state === selectedState;
      const matchesType = selectedType === 'all' || spot.type === selectedType;
      return matchesSearch && matchesState && matchesType;
    });
  }, [searchQuery, selectedState, selectedType, showFavoritesOnly, favorites, fishingSpots]);

  const freePreviewSpotIds = useMemo(
    () => new Set(fishingSpots.slice(0, GUEST_SPOT_LIMIT).map((spot) => spot.id)),
    [fishingSpots],
  );
  const filteredSpots = isProUser
    ? matchingSpots
    : matchingSpots.filter((spot) => freePreviewSpotIds.has(spot.id));
  const maxSpotsToShow = isProUser ? visibleCount : GUEST_SPOT_LIMIT;
  const displayedSpots = filteredSpots.slice(0, maxSpotsToShow);
  const lockedSpotsCount = isProUser ? 0 : Math.max(0, matchingSpots.length - filteredSpots.length);

  const uniqueStatesCount = new Set(fishingSpots.map(s => s.state)).size;
  const uniqueFishCount = new Set(fishingSpots.flatMap(s => s.fish)).size;

  const scrollToSearch = () => {
    document.getElementById('search-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  if (loading) return <FullLoading />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-50">
        <div className="max-w-8xl mx-2 px-2 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg">
              <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-white">FishingFinderUSA</h1>
              <p className="text-blue-300 text-sm">Find fishing spots in all 50 states</p>
            </div>
          </div>
          <nav className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-6">
              <button
                onClick={() => { setShowFavoritesOnly(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className={`transition ${!showFavoritesOnly ? 'text-white' : 'text-blue-200 hover:text-white'} flex items-center gap-1.5`}
              >
                <Home className="w-5 h-5" />
                <span className="hidden xl:inline">Home</span>
              </button>
              <button
                onClick={() => navigate('/fish-guide')}
                className="text-blue-200 hover:text-white transition flex items-center gap-1.5"
              >
                <BookOpen className="w-5 h-5" />
                <span className="hidden xl:inline">Fish Guide</span>
              </button>
              {isProUser && (
                <button
                  onClick={() => navigate('/my-catches')}
                  className="text-blue-200 hover:text-white transition flex items-center gap-1.5"
                >
                  <Fish className="w-4 h-4" />
                  <span className="hidden xl:inline">Catch Log</span>
                </button>
              )}
              {isProUser && (
                <button
                  onClick={() => navigate('/my-trips')}
                  className="text-blue-200 hover:text-white transition flex items-center gap-1.5"
                >
                  <Tent className="w-4 h-4" />
                  <span className="hidden xl:inline">My Trips</span>
                </button>
              )}

              <button
                onClick={() => navigate('/licenses')}
                className="text-blue-200 hover:text-white transition flex items-center gap-1.5"
              >
                <Scroll className="w-4 h-4" />
                <span className="hidden xl:inline">Licenses</span>
              </button>
              <button
                onClick={() => navigate('/regulations')}
                className="text-blue-200 hover:text-white transition flex items-center gap-1.5"
              >
                <Scale className="w-4 h-4" />
                <span className="hidden xl:inline">Lodging/Regulations</span>
              </button>
              <button
                onClick={() => navigate('/share-qr')}
                className="text-blue-200 hover:text-white transition flex items-center gap-1.5"
                title="Share via QR code"
              >
                <QrCode className="w-4 h-4" />
                <span className="hidden xl:inline">Share</span>
              </button>



              {isProUser && (
                <button
                  onClick={openFavorites}
                  className={`flex items-center gap-2 transition ${showFavoritesOnly ? 'text-white' : 'text-blue-200 hover:text-white'}`}
                >
                  <Heart className="w-4 h-4" />
                  <span className="hidden xl:inline">My Favorites</span>
                  {favorites.length > 0 && (
                    <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{favorites.length}</span>
                  )}
                </button>
              )}
            </div>

            {/* Go Pro / Pro Badge Button */}
            {isProUser ? (
              <div className="hidden md:flex items-center gap-1.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 rounded-full px-3 py-1.5">
                <Crown className="w-4 h-4 text-amber-400" />
                <span className="text-amber-300 text-sm font-semibold">Pro</span>
              </div>
            ) : 
              <Button
                onClick={() => handleGoProAction()}
                className="hidden md:flex bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold shadow-lg shadow-amber-500/20 gap-1.5"
                size="sm"
              >
                <Crown className="w-4 h-4" />
                Go Pro
              </Button>
           }



            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 text-white hover:bg-inherit bg-blue-500/10">
                    <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5" color="white"/>
                    </div>
                    <span className="hidden lg:inline text-white">{userProfile?.display_name || user.email?.split('@')[0]}</span>
                    <ChevronDown className="w-4 h-4" color="white"/>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-slate-800 border-slate-700">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium text-white">{userProfile?.display_name || 'User'}</p>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </div>
                    {isAdmin &&(<DropdownMenuItem onClick={() => navigate('/admin/dashboard')} className="text-blue-200 hover:text-white hover:bg-blue-500/20 cursor-pointer">
                      <LayoutDashboard className="w-4 h-4 mr-2" />
                      Admin Dashboard
                    </DropdownMenuItem>)}
                  {isProUser && (
                    <>
                      <DropdownMenuItem onClick={openFavorites} className="text-blue-200 hover:text-white hover:bg-blue-500/20 cursor-pointer">
                        <Heart className="w-4 h-4 mr-2" />
                        My Favorites ({favorites.length})
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/my-catches')} className="text-blue-200 md:hidden hover:text-white hover:bg-blue-500/20 cursor-pointer">
                        <Fish className="w-4 h-4 mr-2" />
                        My Catch Log
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => navigate('/my-trips')}
                        className="text-blue-200 hover:text-white md:hidden transition flex items-center gap-1.5"
                      >
                        <Tent className="w-4 h-4" />
                        My Trips
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem
                    onClick={() => navigate('/share-qr')}
                    className="text-blue-200 hover:text-white md:hidden transition flex items-center gap-1.5"
                  >
                    <QrCode className="w-4 h-4" />
                    Share Trips
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate('/leaderboard')}
                    className="text-blue-200 hover:text-white md:hidden transition flex items-center gap-1.5"
                  >
                    <Trophy className="w-4 h-4" />
                    Leaderboard
                  </DropdownMenuItem>
                  {!isProUser && (<DropdownMenuItem onClick={() => handleGoProAction()} className="text-blue-200 md:hidden hover:text-white hover:bg-blue-500/20 cursor-pointer">
                    <Crown className="w-4 h-4 mr-2" />
                    Go Pro
                  </DropdownMenuItem>)}
                  <DropdownMenuSeparator className="bg-slate-700" />
                  <DropdownMenuItem onClick={handleSignOut} className="text-red-400 hover:text-red-300 hover:bg-red-500/20 cursor-pointer">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/20 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Account
                  </DropdownMenuItem>
                </DropdownMenuContent>

              </DropdownMenu>
            ) : (
              <Button onClick={() => setShowAuthModal(true)} className="bg-blue-500 hover:bg-blue-600 text-white ml-4">
                <User className="w-4 h-4 mr-2" />
                Sign In
              </Button>
            )}
          </nav>
        </div>
      </header>

      {/* Guest Banner */}
      {!isProUser && !showFavoritesOnly && (
        <div className="bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-amber-500/20 border-b border-amber-500/30">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/20 rounded-full p-1.5">
                <Lock className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-amber-200 text-sm">
                <span className="font-semibold text-amber-300">{isGuest ? 'Guest Member' : 'Free Account'}:</span> Preview {GUEST_SPOT_LIMIT} fishing spots.
                <span className="hidden sm:inline"> Go Pro to unlock all {fishingSpots.length}+ spots and premium features.</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isGuest && (
                <Button
                  onClick={() => setShowAuthModal(true)}
                  size="sm"
                  variant="outline"
                  className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 text-xs bg-inherit"
                >
                  Sign Up Free
                </Button>
              )}
              <Button
                onClick={() => handleGoProAction('yearly')}
                size="sm"
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs"
              >
                <Crown className="w-3 h-3 mr-1" />
                Go Pro
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section with Breathtaking Lake Image */}
      {!showFavoritesOnly && (
        <section className="relative overflow-hidden">
          {/* Hero Image */}
          <div className="absolute inset-0">
            <img
              src={heroImage}
              alt="Breathtaking mountain lake at golden hour"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-900/60 via-slate-900/40 to-slate-900" />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-900/30 to-transparent" />
          </div>

          <div className="relative z-10 max-w-6xl mx-auto px-4 py-24 md:py-36">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-5 py-2 mb-8">
                <Fish className="w-4 h-4 text-blue-300" />
                <span className="text-blue-100 text-sm font-medium">Find Fishing Spots Across the USA</span>
              </div>

              <h2 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
                Discover Your Next
                <br />
                <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                  Fishing Adventure
                </span>
              </h2>

              <p className="text-xl md:text-2xl text-blue-100/90 mb-10 max-w-3xl mx-auto leading-relaxed">
                Explore {fishingSpots.length}+ handpicked fishing spots across all 50 states.
                Lakes, rivers, oceans, and more — with seasonal tips and local knowledge.
              </p>

              <div className="flex flex-col sm:flex-row justify-center gap-4 mb-14">
                <Button
                  onClick={scrollToSearch}
                  size="lg"
                  className="bg-blue-500 hover:bg-blue-600 text-white text-lg px-8 py-6 rounded-xl shadow-lg shadow-blue-500/30 transition-all hover:shadow-blue-500/50 hover:scale-105"
                >
                  <Search className="w-5 h-5 mr-2" />
                  Find Fishing Spots
                </Button>
                <Button
                  onClick={() => navigate('/fish-guide')}
                  size="lg"
                  className="bg-blue-500 hover:bg-blue-600 text-white text-lg px-8 py-6 rounded-xl shadow-lg shadow-blue-500/30 transition-all hover:shadow-blue-500/50 hover:scale-105"
                >
                  <BookOpen className="w-5 h-5 mr-2" />
                  Fish Species Guide
                </Button>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap justify-center gap-6 md:gap-10">
                <div className="bg-white/10 backdrop-blur-md rounded-2xl px-8 py-5 border border-white/20 hover:bg-white/15 transition-all">
                  <p className="text-4xl font-bold text-white">{fishingSpots.length}+</p>
                  <p className="text-blue-200 text-sm mt-1">Fishing Spots</p>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl px-8 py-5 border border-white/20 hover:bg-white/15 transition-all">
                  <p className="text-4xl font-bold text-white">{uniqueStatesCount}</p>
                  <p className="text-blue-200 text-sm mt-1">States Covered</p>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl px-8 py-5 border border-white/20 hover:bg-white/15 transition-all">
                  <p className="text-4xl font-bold text-white">{uniqueFishCount}+</p>
                  <p className="text-blue-200 text-sm mt-1">Fish Species</p>
                </div>
                {!isProUser ? (
                  <div
                    className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 backdrop-blur-md rounded-2xl px-8 py-5 border border-amber-500/30 hover:border-amber-400/50 transition-all cursor-pointer"
                    onClick={() => navigate('/pricing')}
                  >
                    <p className="text-4xl font-bold text-amber-400">5</p>
                    <p className="text-amber-200 text-sm mt-1">Guest Preview</p>
                  </div>
                ) : (
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl px-8 py-5 border border-white/20 hover:bg-white/15 transition-all">
                    <p className="text-4xl font-bold text-white">{isProUser ? 'Pro' : 'Free'}</p>
                    <p className="text-blue-200 text-sm mt-1">{isProUser ? 'Member' : 'To Explore'}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Decorative wave */}
          <div className="absolute bottom-0 left-0 right-0">
            <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
              <path d="M0 40C240 80 480 0 720 40C960 80 1200 0 1440 40V80H0V40Z" fill="rgb(15 23 42)" fillOpacity="0.5" />
              <path d="M0 60C240 80 480 40 720 60C960 80 1200 40 1440 60V80H0V60Z" fill="rgb(15 23 42)" />
            </svg>
          </div>
        </section>
      )}

      {/* Favorites Header */}
      {showFavoritesOnly && (
        <section className="py-12 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Heart className="w-10 h-10 text-red-500 fill-red-500" />
              <h2 className="text-3xl md:text-5xl font-bold text-white">My Favorite Spots</h2>
            </div>
            <p className="text-xl text-blue-200">
              {favorites.length === 0
                ? "You haven't saved any fishing spots yet. Browse and click the heart icon to save your favorites!"
                : `You have ${favorites.length} saved fishing spot${favorites.length !== 1 ? 's' : ''}`
              }
            </p>
            {favorites.length === 0 && (
              <Button onClick={() => setShowFavoritesOnly(false)} className="mt-6 bg-blue-500 hover:bg-blue-600">
                Browse Fishing Spots
              </Button>
            )}
          </div>
        </section>
      )}

      {/* Search and Filters */}
      <section id="search-section" className={`max-w-7xl mx-auto px-4 ${showFavoritesOnly ? 'pt-4' : '-mt-4'} relative z-20`}>
        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                placeholder={!isProUser ? "Search fishing spots (5 spot preview)..." : "Search by location, fish species, or state..."}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(24); }}
                className="pl-10 h-12 text-lg"
              />
            </div>
            <Select value={selectedState} onValueChange={(v) => { setSelectedState(v); setVisibleCount(24); }}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Select State" />
              </SelectTrigger>
              <SelectContent>
                {states.map(state => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedType} onValueChange={(v) => { setSelectedType(v); setVisibleCount(24); }}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Water Type" />
              </SelectTrigger>
              <SelectContent>
                {waterTypes.map(type => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Guest notice inside search bar */}
          {!isProUser && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-amber-800 text-sm">
                  <span className="font-semibold">{isGuest ? 'Guest' : 'Free account'} Preview:</span> Showing {filteredSpots.length} of {matchingSpots.length} spots.
                  Upgrade to Pro to see all spots and species info.
                </p>
              </div>
              <Button
                onClick={() => navigate('/pricing')}
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-white text-xs"
              >
                See Plans
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Results Count + View Toggle */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <p className="text-blue-200">
              {!isProUser ? (
                <>
                  Showing <span className="text-amber-400 font-semibold">{filteredSpots.length}</span> of{' '}
                  <span className="text-white font-semibold">{matchingSpots.length}</span> fishing spots
                  <span className="text-amber-400/80 ml-1">(Free Preview)</span>
                </>
              ) : (
                <>
                  Showing <span className="text-white font-semibold">{viewMode === 'map' ? filteredSpots.length : Math.min(visibleCount, filteredSpots.length)}</span> of{' '}
                  <span className="text-white font-semibold">{filteredSpots.length}</span>
                  {showFavoritesOnly ? ' favorite' : ''} fishing spots
                </>
              )}
            </p>
            {showFavoritesOnly && (
              <Button variant="ghost" size="sm" onClick={() => setShowFavoritesOnly(false)} className="text-blue-300 hover:text-white hover:bg-blue-500/20">
                View All Spots
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-800/80 rounded-lg border border-white/10 p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  viewMode === 'grid'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'text-blue-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Grid</span>
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  viewMode === 'map'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'text-blue-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Map className="w-4 h-4" />
                <span className="hidden sm:inline">Map</span>
              </button>
            </div>
            {/* Water Type Filters */}
            <div className="hidden md:flex gap-2 flex-wrap">
              {waterTypes.slice(1).map(type => (
                <button
                  key={type.value}
                  onClick={() => { setSelectedType(selectedType === type.value ? 'all' : type.value); setVisibleCount(24); }}
                  className={`px-3 py-1 rounded-full text-sm transition ${
                    selectedType === type.value
                      ? 'bg-blue-500 text-white'
                      : 'bg-white/10 text-blue-200 hover:bg-white/20'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* Map View */}
      {viewMode === 'map' && (
        <section className="max-w-7xl mx-auto px-4 pb-16">
          <FishingMapView
            spots={isProUser ? filteredSpots : displayedSpots}
            onSelectSpot={setSelectedSpot}
            favorites={favorites}
          />
          {!isProUser && lockedSpotsCount > 0 && (
            <div className="mt-6 bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-500/15 rounded-xl border border-amber-500/30 p-6 text-center">
              <p className="text-amber-200 mb-3">
                <Lock className="w-4 h-4 inline mr-1" />
                Map shows {filteredSpots.length} of {matchingSpots.length} spots. <span className="font-semibold text-amber-300">Go Pro</span> to see all spots on the map.
              </p>
              <Button
                onClick={() => navigate('/pricing')}
                size="sm"
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
              >
                <Crown className="w-4 h-4 mr-1" />
                Unlock All Spots
              </Button>
            </div>
          )}
        </section>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
      <section className="max-w-7xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedSpots.map(spot => {
            const coords = spotCoordinates[spot.id];
            const distance = userLocation && coords
              ? calculateDistance(userLocation.lat, userLocation.lng, coords.lat, coords.lng)
              : null;

            return (
            <Card
              key={spot.id}
              className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-all cursor-pointer group relative hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-500/10"
              onClick={() => setSelectedSpot(spot)}
            >
              {/* Favorite Button */}
              <button
                onClick={(e) => toggleFavorite(spot.id, e)}
                className={`absolute top-4 right-4 z-10 p-2 rounded-full transition-all ${
                  favorites.includes(spot.id)
                    ? 'bg-red-500/20 text-red-500'
                    : 'bg-white/10 text-white/50 hover:text-red-400 hover:bg-red-500/10'
                }`}
                disabled={loadingFavorites === spot.id}
              >
                <Heart className={`w-5 h-5 transition-all ${favorites.includes(spot.id) ? 'fill-red-500' : ''} ${loadingFavorites === spot.id ? 'animate-pulse' : ''}`} />
              </button>

              <CardHeader className="pb-3">
                <div className="flex items-start justify-between pr-10">
                  <div>
                    <Badge className={`${getTypeColor(spot.type)} text-white mb-2`}>
                      <span className="flex items-center gap-1">
                        {getTypeIcon(spot.type)}
                        {getTypeLabel(spot.type)}
                      </span>
                    </Badge>
                    <CardTitle className="text-white text-xl group-hover:text-blue-300 transition">
                      {spot.name}
                    </CardTitle>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-blue-300 text-sm">
                  <MapPin className="w-4 h-4" />
                  {spot.state}
                  {distance !== null && (
                    <span className="text-blue-400 font-medium ml-1">
                      ({formatDistance(distance)})
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 text-sm mb-4 line-clamp-2">{spot.description}</p>

                {/* Best Season */}
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs text-blue-300">Best Season:</span>
                  <span className={`text-xs font-medium ${getSeasonColor(spot.bestSeason)}`}>{spot.bestSeason}</span>
                </div>

                {/* Fish Species */}
                <div className="mb-4">
                  <p className="text-blue-300 text-xs uppercase tracking-wide mb-2">Fish Species</p>
                  <div className="flex flex-wrap gap-1">
                    {spot.fish.slice(0, 4).map(fish => (
                      <Badge key={fish} variant="outline" className="text-blue-200 border-blue-400/50 text-xs">
                        {fish}
                      </Badge>
                    ))}
                    {spot.fish.length > 4 && (
                      <Badge variant="outline" className="text-blue-200 border-blue-400/50 text-xs">
                        +{spot.fish.length - 4} more
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Quick Tip */}
                {spot.fishingTips && spot.fishingTips.length > 0 && (
                  <div className="bg-blue-500/10 rounded-lg p-2.5 mb-4 border border-blue-400/20">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-blue-200 line-clamp-2">{spot.fishingTips[0]}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-green-400" />
                    <span className="text-green-400 text-sm font-medium">{spot.cost}</span>
                  </div>
                  <span className="text-blue-300 text-sm flex items-center gap-1 group-hover:text-blue-200">
                    View Details
                    <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>

        {/* Guest Locked Spots CTA */}
        {isGuest && lockedSpotsCount > 0 && (
          <div className="mt-10">
            {/* Big upgrade CTA */}
            <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-500/15 rounded-2xl border-2 border-amber-500/30 p-8 md:p-12 text-center">
              <div className="max-w-2xl mx-auto">
                <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-500/30">
                  <Lock className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                  {lockedSpotsCount}+ More Spots Waiting for You
                </h3>
                <p className="text-gray-300 text-lg mb-3">
                  You've seen {GUEST_SPOT_LIMIT} spots in the free preview — but there's so much more to discover!
                </p>
                <p className="text-blue-200/70 mb-8">
                  Unlock all {fishingSpots.length}+ fishing spots across {uniqueStatesCount} states, plus catch logging, trip planning, weather data, and more. 
                  It's the ultimate fishing companion for you and your family.
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-4">
                  <Button
                    onClick={() => isGuest ? setShowAuthModal(true) : handleGoProAction('yearly')}
                    size="lg"
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold px-10 py-6 text-lg rounded-xl shadow-lg shadow-amber-500/20"
                  >
                    <Crown className="w-5 h-5 mr-2" />
                    {isGuest ? 'Sign Up & Go Pro' : 'Go Pro'}
                  </Button>
                  <Button
                    onClick={() => navigate('/pricing')}
                    size="lg"
                    variant="outline"
                    className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 px-10 py-6 text-lg rounded-xl bg-inherit"
                  >
                    View All Plans
                  </Button>
                </div>
                <p className="text-gray-500 text-sm mt-4">Starting at just $6.67/month with the yearly plan</p>
              </div>
            </div>
          </div>
        )}

        {/* Load More (for logged-in users) */}
        {isProUser && visibleCount < filteredSpots.length && (
          <div className="text-center mt-10">
            <Button
              onClick={() => setVisibleCount(prev => prev + 24)}
              size="lg"
              className="bg-blue-500 hover:bg-blue-600 text-white px-10"
            >
              Load More Spots ({filteredSpots.length - visibleCount} remaining)
            </Button>
          </div>
        )}

        {filteredSpots.length === 0 && (
          <div className="text-center py-16">
            {showFavoritesOnly ? (
              <>
                <Heart className="w-16 h-16 text-red-400/50 mx-auto mb-4" />
                <h3 className="text-xl text-white mb-2">No favorites match your filters</h3>
                <p className="text-blue-300 mb-4">Try adjusting your search or filters</p>
                <Button
                  onClick={() => { setSearchQuery(''); setSelectedState('All States'); setSelectedType('all'); }}
                  variant="outline"
                  className="border-blue-400 text-blue-300 bg-blue-500/20 hover:bg-blue-500/50"
                >
                  Clear Filters
                </Button>
              </>
            ) : (
              <>
                <Fish className="w-16 h-16 text-blue-400/50 mx-auto mb-4" />
                <h3 className="text-xl text-white mb-2">No fishing spots found</h3>
                <p className="text-blue-300">Try adjusting your search or filters</p>
              </>
            )}
          </div>
        )}
      </section>
      )}


      {/* Detail Modal */}
      {selectedSpot && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedSpot(null)}>
          <div className="bg-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <Badge className={`${getTypeColor(selectedSpot.type)} text-white mb-2`}>
                    <span className="flex items-center gap-1">
                      {getTypeIcon(selectedSpot.type)}
                      {getTypeLabel(selectedSpot.type)}
                    </span>
                  </Badge>
                  <h2 className="text-2xl font-bold text-white">{selectedSpot.name}</h2>
                  <p className="text-blue-300">{selectedSpot.state}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => toggleFavorite(selectedSpot.id, e)}
                    className={`p-2 rounded-full transition-all ${
                      favorites.includes(selectedSpot.id)
                        ? 'bg-red-500/20 text-red-500'
                        : 'bg-white/10 text-white/50 hover:text-red-400 hover:bg-red-500/10'
                    }`}
                  >
                    <Heart className={`w-6 h-6 ${favorites.includes(selectedSpot.id) ? 'fill-red-500' : ''}`} />
                  </button>
                  <button onClick={() => setSelectedSpot(null)} className="text-gray-400 hover:text-white">
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <p className="text-gray-300 mb-6">{selectedSpot.description}</p>

              <div className="space-y-4">
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-blue-300 mb-2">
                    <MapPin className="w-5 h-5" />
                    <span className="font-medium">Address</span>
                  </div>
                  <p className="text-white">{selectedSpot.address}</p>
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-blue-300 mb-2">
                    <Calendar className="w-5 h-5" />
                    <span className="font-medium">Best Season</span>
                  </div>
                  <p className={`text-lg font-semibold ${getSeasonColor(selectedSpot.bestSeason)}`}>{selectedSpot.bestSeason}</p>
                </div>


                {/* Real-Time Weather & Fishing Conditions */}
                {isProUser ? (
                  <WeatherWidget
                    address={selectedSpot.address}
                    bestSeason={selectedSpot.bestSeason}
                    spotType={selectedSpot.type}
                    spotName={selectedSpot.name}
                  />
                ) : isGuest ? (
                  <div className="flex items-center flex-col bg-blue-500/10 border border-blue-400/20 rounded-lg p-4 text-blue-100">
                    <p className="font-medium">Sign up for a Pro account to unlock weather forecasts.</p>
                    <Button className="mt-3 " size="sm" onClick={() => setShowAuthModal(true)}>
                      Sign Up Free
                    </Button>
                  </div>
                )
                 : (
                  <div className="flex flex-col items-center bg-blue-500/10 border border-blue-400/20 rounded-lg p-4 text-blue-100">
                    <p className="font-medium">Weather forecasts are a Pro feature.</p>
                    <Button className="mt-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white " size="sm" onClick={() => setShowSubscriptionModal(true)}>
                      Unlock Pro weather
                    </Button>
                  </div>
                )}

                {/* Fish Species - Detailed Section with Images, Bait & Techniques */}

                <FishSpeciesSpotSection
                  fishNames={selectedSpot.fish}
                  onViewFullGuide={(species) => {
                    setSelectedSpot(null);
                    navigate('/fish-guide');
                  }}
                />


                {/* Fishing Tips */}
                {selectedSpot.fishingTips && selectedSpot.fishingTips.length > 0 && (
                  <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-lg p-4 border border-blue-400/20">
                    <div className="flex items-center gap-2 text-yellow-400 mb-3">
                      <Lightbulb className="w-5 h-5" />
                      <span className="font-medium">Local Fishing Tips</span>
                    </div>
                    <ul className="space-y-3">
                      {selectedSpot.fishingTips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <span className="bg-blue-500/30 text-blue-300 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-blue-100 text-sm">{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-blue-300 mb-2">
                    <DollarSign className="w-5 h-5" />
                    <span className="font-medium">Cost</span>
                  </div>
                  <p className="text-green-400 font-medium text-lg">{selectedSpot.cost}</p>
                </div>


                {/* Nearby Accommodations */}
                <AccommodationsSection
                  spotId={selectedSpot.id}
                  spotName={selectedSpot.name}
                  isProUser={isProUser}
                />
              </div>


              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
                <Button
                  className="bg-blue-500 hover:bg-blue-600"
                  onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedSpot.address)}`, '_blank')}
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Get Directions
                </Button>
                <Button
                  variant="outline"
                  className={`${
                    favorites.includes(selectedSpot.id)
                      ? 'bg-red-500/20 border-red-400 text-red-300 hover:bg-red-500/30'
                      : 'border-blue-400 text-blue-300 hover:bg-blue-500/20 bg-inherit'
                  }`}
                  onClick={(e) => toggleFavorite(selectedSpot.id, e)}
                >
                  <Heart className={`w-4 h-4 mr-2 ${favorites.includes(selectedSpot.id) ? 'fill-red-400' : ''}`} />
                  {favorites.includes(selectedSpot.id) ? 'Remove' : 'Favorite'}
                </Button>
                <Button
                  variant="outline"
                  className="border-cyan-400 text-cyan-300 hover:bg-cyan-500/20 bg-inherit"
                  onClick={(e) => { e.stopPropagation(); setShowShareDialog(true); }}
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share this spot
                </Button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* Subscription Modal */}
      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        onSubscribed={() => {
          setShowSubscriptionModal(false);
          setIsProUser(true);
          if (user?.id) checkSubscription(user.id);
        }}
        userEmail={user?.email}
        userName={userProfile?.display_name}
      />

      <AppleIapModal
        isOpen={showAppleIapModal}
        onClose={() => setShowAppleIapModal(false)}
        onSuccess={() => {
          setShowAppleIapModal(false);
          setIsProUser(true);
          if (user?.id) checkSubscription(user.id);
        }}
        userId={user?.id ?? null}
        userEmail={user?.email ?? undefined}
        defaultPlan={appleIapPlan}
      />

      <AndroidIapModal
        isOpen={showAndroidIapModal}
        onClose={() => setShowAndroidIapModal(false)}
        onSuccess={() => {
          setShowAndroidIapModal(false);
          setIsProUser(true);
          if (user?.id) checkSubscription(user.id);
        }}
        defaultPlan={androidIapPlan}
      />

      {/* Spot Share QR Dialog — renders only when a spot is selected so it can
          read its id/name. Controlled by showShareDialog state. */}
      {selectedSpot && (
        <SpotShareDialog
          open={showShareDialog}
          onOpenChange={setShowShareDialog}
          spotId={selectedSpot.id}
          spotName={selectedSpot.name}
          spotState={selectedSpot.state}
        />
      )}


      {/* Family Benefits Section for Guests */}
      {isGuest && !showFavoritesOnly && (
        <section className="max-w-6xl mx-auto px-4 pb-16">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-5 py-2 mb-6">
              <Users className="w-4 h-4 text-green-400" />
              <span className="text-green-300 text-sm font-medium">For You & Your Family</span>
            </div>
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Why Join FishingFinderUSA?
            </h3>
            <p className="text-blue-200/70 text-lg max-w-2xl mx-auto">
              It's more than just finding fishing spots — it's about creating unforgettable experiences with the people who matter most.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Users, title: 'Quality Family Time', desc: 'Unplug from screens and reconnect with your loved ones in the great outdoors.', color: 'from-blue-500 to-cyan-500' },
              { icon: TreePine, title: 'Teach Kids About Nature', desc: 'Introduce your children to wildlife, ecosystems, and conservation through fishing.', color: 'from-green-500 to-emerald-500' },
              { icon: Compass, title: 'New Adventures Weekly', desc: `With ${fishingSpots.length}+ spots across 50 states, every weekend can be a new family adventure.`, color: 'from-amber-500 to-orange-500' },

              { icon: Camera, title: 'Lasting Memories', desc: 'Log catches with photos, plan trips together, and build a family fishing journal.', color: 'from-purple-500 to-pink-500' },
              { icon: Sun, title: 'Health & Wellness', desc: 'Fishing reduces stress, improves mental health, and gets the whole family active.', color: 'from-yellow-500 to-orange-400' },
              { icon: Award, title: 'Build Life Skills', desc: 'Kids learn patience, problem-solving, and perseverance through fishing.', color: 'from-red-500 to-rose-500' },
              { icon: Shield, title: 'Affordable Recreation', desc: 'Pro membership gives your whole family access for less than the cost of a lure.', color: 'from-teal-500 to-cyan-500' },
              { icon: Waves, title: 'Learn Conservation', desc: 'Teach sustainable fishing practices and protecting waterways for future generations.', color: 'from-indigo-500 to-blue-500' },
            ].map((benefit, i) => (
              <div key={i} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700 hover:border-green-500/30 transition-all group hover:transform hover:scale-[1.02]">
                <div className={`w-10 h-10 bg-gradient-to-br ${benefit.color} rounded-lg flex items-center justify-center mb-3 shadow-lg`}>
                  <benefit.icon className="w-5 h-5 text-white" />
                </div>
                <h4 className="text-white font-semibold mb-1.5">{benefit.title}</h4>
                <p className="text-sm text-gray-400 leading-relaxed">{benefit.desc}</p>
              </div>
            ))}
          </div>

          {/* Family CTA */}
          <div className="mt-10 bg-gradient-to-r from-green-500/10 via-blue-500/10 to-green-500/10 rounded-2xl border border-green-500/20 p-8 text-center">
            <Users className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <h4 className="text-2xl font-bold text-white mb-2">The Best Gift for Your Family</h4>
            <p className="text-gray-300 mb-6 max-w-xl mx-auto">
              For less than the cost of a single fishing lure, give your family unlimited access to America's best fishing spots — starting at just <span className="text-amber-400 font-semibold">$6.67/month</span>.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Button
                onClick={() => setShowAuthModal(true)}
                size="lg"
                className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold px-8 py-5 rounded-xl shadow-lg shadow-green-500/20"
              >
                <Users className="w-5 h-5 mr-2" />
                Join for Your Family
              </Button>
              <Button
                onClick={() => navigate('/pricing')}
                size="lg"
                variant="outline"
                className="border-green-500/40 text-green-300 hover:bg-green-500/10 px-8 py-5 rounded-xl bg-inherit"
              >
                Compare Plans
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Go Pro CTA Section (for logged-in non-pro users) */}
      {!isProUser && !isGuest && !showFavoritesOnly && (
        <section className="max-w-5xl mx-auto px-4 pb-16">
          <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-2xl border border-amber-500/30 p-8 md:p-12 text-center">
            <Crown className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <h3 className="text-3xl font-bold text-white mb-3">Upgrade to FishingFinderUSA Pro</h3>
            <p className="text-gray-300 mb-6 max-w-lg mx-auto">
              Unlimited favorites, catch log with photos, trip planner, weather data, and more — starting at just $9.99/month.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button
                onClick={() => handleGoProAction('yearly')}
                size="lg"
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold px-10 py-6 text-lg rounded-xl shadow-lg shadow-amber-500/20"
              >
                <Crown className="w-5 h-5 mr-2" />
                Go Pro Now
              </Button>
              <Button
                onClick={() => navigate('/pricing')}
                size="lg"
                variant="outline"
                className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 px-10 py-6 text-lg rounded-xl bg-inherit"
              >
                View Pricing
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-blue-500/20 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg">
                  <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
                </div>
                <span className="text-lg font-bold text-white">FishingFinderUSA</span>
              </div>
              <p className="text-blue-300 text-sm">
                Your ultimate guide to {fishingSpots.length}+ fishing spots across all 50 states. Find lakes, rivers, oceans, and more.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Water Types</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                <li><button onClick={() => { setSelectedType('lake'); setShowFavoritesOnly(false); scrollToSearch(); }} className="hover:text-white transition">Lakes ({fishingSpots.filter(s => s.type === 'lake').length})</button></li>
                <li><button onClick={() => { setSelectedType('river'); setShowFavoritesOnly(false); scrollToSearch(); }} className="hover:text-white transition">Rivers ({fishingSpots.filter(s => s.type === 'river').length})</button></li>
                <li><button onClick={() => { setSelectedType('ocean'); setShowFavoritesOnly(false); scrollToSearch(); }} className="hover:text-white transition">Oceans & Bays ({fishingSpots.filter(s => s.type === 'ocean').length})</button></li>
                <li><button onClick={() => { setSelectedType('pay-lake'); setShowFavoritesOnly(false); scrollToSearch(); }} className="hover:text-white transition">Pay Lakes ({fishingSpots.filter(s => s.type === 'pay-lake').length})</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Popular States</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                {['Florida', 'Texas', 'California', 'Alaska', 'Michigan', 'New York'].map(state => (
                  <li key={state}>
                    <button onClick={() => { setSelectedState(state); setShowFavoritesOnly(false); scrollToSearch(); }} className="hover:text-white transition">
                      {state} ({fishingSpots.filter(s => s.state === state).length} spots)
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Account</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                {user ? (
                  <>
                    {isProUser && <li><button onClick={openFavorites} className="hover:text-white transition">My Favorites</button></li>}
                    <li><button onClick={handleSignOut} className="hover:text-white transition">Sign Out</button></li>
                    <li><button onClick={() => setShowDeleteDialog(true)} className="hover:text-white transition">Delete Account</button></li>
                  </>
                ) : (
                  <>
                    <li><button onClick={() => setShowAuthModal(true)} className="hover:text-white transition">Sign In</button></li>
                    <li><button onClick={() => setShowAuthModal(true)} className="hover:text-white transition">Create Account</button></li>
                  </>
                )}
                <li><button onClick={() => navigate('/fish-guide')} className="hover:text-white transition">Fish Species Guide</button></li>
                <li><button onClick={() => navigate('/licenses')} className="hover:text-white transition">Fishing Licenses</button></li>
                {!isIosMedian && (<li><button onClick={() => navigate('/pricing')} className="hover:text-white transition flex items-center gap-1"><Crown className="w-3 h-3 text-amber-400" /> Pro Pricing</button></li>)}
                <li><button onClick={() => navigate('/share-qr')} className="hover:text-white transition flex items-center gap-1"><QrCode className="w-3 h-3 text-blue-300" /> Share via QR</button></li>

              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Privacy & Terms</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                <li> <button
                onClick={() => navigate('/privacy')}
                className="hover:text-white transition"
              >
                Privacy Policy
              </button></li>
              <li><button
                onClick={() => navigate('/terms')}
                className="hover:text-white transition"
              >
                Terms of Service
              </button></li>
              <li><button
                onClick={() => navigate('/contact')}
                className="hover:text-white transition"
              >
                Contact
              </button></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-blue-500/20 mt-8 pt-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-blue-300 text-sm">
            <p className="text-center md:text-left">
              &copy; 2026 FishingFinderUSA. All rights reserved. {fishingSpots.length}+ spots across {uniqueStatesCount} states. Always check local regulations before fishing.
            </p>
          </div>

        </div>
      </footer>

      {/* Delete Account Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={(open) => { if (!deletingAccount) setShowDeleteDialog(open); }}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center justify-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              Delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-blue-200">
              This will <span className="font-semibold text-red-300">permanently delete</span> your account
              {user?.email ? <> (<span className="text-white">{user.email}</span>)</> : null} and all associated data —
              including your favorites, catch log, photos, and trips.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deletingAccount}
              className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteAccount(); }}
              disabled={deletingAccount}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deletingAccount ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Deleting...
                </span>
              ) : (
                'Delete Permanently'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AppLayout;
