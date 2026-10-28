import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Lazy load heavy child components to isolate errors
const CatchFormModal = React.lazy(() => import('@/components/CatchFormModal'));
const CatchStats = React.lazy(() => import('@/components/CatchStats'));
const AuthModal = React.lazy(() => import('@/components/AuthModal'));

// Inline simple SVG icons to avoid any lucide-react import issues
const FishIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.46-3.44 6-7 6-3.56 0-7.56-2.54-8.5-6Z"/>
    <path d="M18 12v.5"/>
    <path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/>
    <path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5 .23 6.5C5.58 18.03 7 16 7 13.33"/>
  </svg>
);

const SearchIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
  </svg>
);

const PlusIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M12 5v14"/>
  </svg>
);

const ArrowLeftIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
  </svg>
);

const SpinnerIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

const CalendarIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>
  </svg>
);

const MapPinIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);

const ScaleIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>
  </svg>
);

const RulerIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>
  </svg>
);

const TrophyIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
  </svg>
);

const TrashIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
  </svg>
);

const PencilIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>
  </svg>
);

const XIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  </svg>
);

const UserIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

const LogOutIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>
  </svg>
);

const ClockIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const CloudIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>
  </svg>
);

const AnchorIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="3"/><line x1="12" x2="12" y1="22" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
  </svg>
);

const RotateIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
  </svg>
);

interface CatchEntry {
  id: string;
  user_id: string;
  species: string;
  weight_lbs: number | string | null;
  length_inches: number | string | null;
  location: string;
  state: string | null;
  water_body: string | null;
  date: string;
  time_of_day: string | null;
  weather: string | null;
  method: string | null;
  lure_bait: string | null;
  photo_url: string | null;
  notes: string | null;
  is_personal_best: boolean;
  catch_and_release: boolean;
  created_at: string;
}

interface UserProfile {
  id: string;
  email: string;
  display_name: string;
}

const toNum = (val: any, fallback = 0): number => {
  try {
    if (val == null || val === '') return fallback;
    const n = typeof val === 'string' ? parseFloat(val) : Number(val);
    return isNaN(n) || !isFinite(n) ? fallback : n;
  } catch {
    return fallback;
  }
};

const formatDate = (dateStr: string) => {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr || 'Unknown date';
  }
};

const MyCatches: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [catches, setCatches] = useState<CatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editEntry, setEditEntry] = useState<CatchEntry | null>(null);
  const [viewEntry, setViewEntry] = useState<CatchEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSpecies, setFilterSpecies] = useState('all');
  const [sortBy, setSortBy] = useState<string>('date-desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    let mounted = true;

    const checkAuth = async () => {
      try {
        const { data, error: authError } = await supabase.auth.getSession();
        if (!mounted) return;
        if (authError) {
          console.warn('Auth session error:', authError);
          setLoading(false);
          setAuthChecked(true);
          return;
        }
        const session = data?.session;
        if (session?.user) {
          setUser(session.user);
          await Promise.allSettled([
            fetchUserProfile(session.user.id),
            fetchCatches(session.user.id),
          ]);
        } else {
          setLoading(false);
        }
        if (mounted) setAuthChecked(true);
      } catch (err) {
        console.error('Auth check failed:', err);
        if (mounted) {
          setLoading(false);
          setAuthChecked(true);
        }
      }
    };

    checkAuth();

    let subscription: any = null;
    try {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;
        try {
          if (session?.user) {
            setUser(session.user);
            await Promise.allSettled([
              fetchUserProfile(session.user.id),
              fetchCatches(session.user.id),
            ]);
          } else {
            setUser(null);
            setUserProfile(null);
            setCatches([]);
            setLoading(false);
          }
        } catch (err) {
          console.error('Auth state change error:', err);
        }
      });
      subscription = data?.subscription;
    } catch (err) {
      console.error('Failed to set up auth listener:', err);
    }

    return () => {
      mounted = false;
      try { subscription?.unsubscribe(); } catch {}
    };
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (!error && data) setUserProfile(data);
    } catch (err) {
      console.warn('Could not fetch user profile:', err);
    }
  };

  const fetchCatches = async (userId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('catch_log')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });
      if (error) {
        console.error('Error fetching catches:', error);
        setCatches([]);
      } else {
        setCatches(data || []);
      }
    } catch (err) {
      console.error('Exception fetching catches:', err);
      setCatches([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const entry = catches.find(c => c.id === id);
      if (entry?.photo_url) {
        try {
          const path = entry.photo_url.split('/catch-photos/')[1];
          if (path) await supabase.storage.from('catch-photos').remove([path]);
        } catch {}
      }
      const { error } = await supabase.from('catch_log').delete().eq('id', id);
      if (error) throw error;
      setCatches(prev => prev.filter(c => c.id !== id));
      setDeleteConfirm(null);
      if (viewEntry?.id === id) setViewEntry(null);
    } catch (err) {
      console.error('Error deleting catch:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleSignOut = async () => {
    try { await supabase.auth.signOut(); } catch {}
    setUser(null);
    setUserProfile(null);
    setCatches([]);
    setShowUserMenu(false);
  };

  // Permanently delete account (Apple App Store guideline 5.1.1(v))
  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const { data, error } = await supabase.functions.invoke('delete-account', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error || (data && data.error)) {
        throw new Error((data && data.error) || error?.message || 'Failed to delete account');
      }
      try { await supabase.auth.signOut(); } catch {}
      setUser(null);
      setUserProfile(null);
      setCatches([]);
      setShowDeleteAccount(false);
      navigate('/');
    } catch (e: any) {
      setDeleteAccountError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setDeletingAccount(false);
    }
  };

  // Derived data
  const uniqueSpecies = useMemo(() => {
    try {
      return Array.from(new Set(catches.map(c => c.species).filter(Boolean))).sort();
    } catch { return []; }
  }, [catches]);

  const filteredCatches = useMemo(() => {
    try {
      let result = catches.filter(c => {
        const matchesSearch = searchQuery === '' ||
          (c.species || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (c.location || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (c.notes || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSpecies = filterSpecies === 'all' || c.species === filterSpecies;
        return matchesSearch && matchesSpecies;
      });

      switch (sortBy) {
        case 'date-desc':
          result.sort((a, b) => { try { return new Date(b.date).getTime() - new Date(a.date).getTime(); } catch { return 0; } });
          break;
        case 'date-asc':
          result.sort((a, b) => { try { return new Date(a.date).getTime() - new Date(b.date).getTime(); } catch { return 0; } });
          break;
        case 'weight-desc':
          result.sort((a, b) => toNum(b.weight_lbs) - toNum(a.weight_lbs));
          break;
        case 'length-desc':
          result.sort((a, b) => toNum(b.length_inches) - toNum(a.length_inches));
          break;
        case 'species':
          result.sort((a, b) => (a.species || '').localeCompare(b.species || ''));
          break;
      }
      return result;
    } catch { return catches; }
  }, [catches, searchQuery, filterSpecies, sortBy]);

  // Render error fallback
  if (renderError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 p-12 text-center max-w-md">
          <FishIcon className="w-16 h-16 text-red-400 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-3">Something Went Wrong</h2>
          <p className="text-blue-200 mb-6 text-sm">{renderError}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => { setRenderError(null); window.location.reload(); }} className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium transition">
              Try Again
            </button>
            <button onClick={() => navigate('/')} className="border border-blue-400 text-blue-300 hover:bg-blue-500/20 px-6 py-2.5 rounded-lg font-medium transition">
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <SpinnerIcon className="w-10 h-10 text-blue-400 mx-auto mb-4" />
          <p className="text-blue-300 text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
        <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/')} className="p-2 rounded-lg transition">
                <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white">FishingFinderUSA</h1>
                <p className="text-blue-300 text-sm">My Catch Log</p>
              </div>
            </div>
            <button onClick={() => navigate('/')} className="border border-blue-400 text-blue-300 hover:bg-blue-500/20 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
              <ArrowLeftIcon className="w-4 h-4" /> Back
            </button>
          </div>
        </header>

        <div className="flex flex-col items-center justify-center py-32 px-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 p-12 text-center max-w-md">
            <FishIcon className="w-16 h-16 text-blue-400 mx-auto mb-6" />
            <h2 className="text-3xl font-bold text-white mb-4">Sign In Required</h2>
            <p className="text-blue-200 mb-8">
              Create an account or sign in to start logging your fishing catches and tracking your personal records.
            </p>
            <button
              onClick={() => setShowAuthModal(true)}
              className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 text-lg rounded-lg font-medium transition flex items-center gap-2 mx-auto"
            >
              <UserIcon className="w-5 h-5" />
              Sign In / Create Account
            </button>
          </div>
        </div>

        <Suspense fallback={null}>
          {showAuthModal && (
            <AuthModal
              isOpen={showAuthModal}
              onClose={() => setShowAuthModal(false)}
              onAuthSuccess={() => setShowAuthModal(false)}
            />
          )}
        </Suspense>
      </div>
    );
  }

  // Authenticated view
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-blue-200 hover:text-white transition md:hidden flex items-center gap-1.5 text-sm">
              <ArrowLeftIcon />
            </button>
            <button onClick={() => navigate('/')} className="p-2 rounded-lg transition">
              <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">FishingFinderUSA</h1>
              <p className="text-blue-300 text-sm">My Catch Log</p>
            </div>
          </div>
          <nav className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-6">
              <button onClick={() => navigate('/')} className="text-blue-200 hover:text-white transition flex items-center gap-1.5 text-sm">
                <ArrowLeftIcon /> Spots
              </button>
              <button onClick={() => navigate('/fish-guide')} className="text-blue-200 hover:text-white transition text-sm">
                 <span className="md:inline hidden">Fish Guide</span>
              </button>
              <button onClick={() => navigate('/my-trips')} className="text-blue-200 hover:text-white transition text-sm">
                <span className="md:inline hidden">My Trips</span>
              </button>
              <span className="text-white font-medium text-sm flex items-center gap-1.5">
                <FishIcon className="w-4 h-4" /> 
                <span className="md:inline hidden">Catch Log</span>
              </span>
            </div>

            {/* Simple user menu (no DropdownMenu dependency) */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 text-white hover:bg-blue-500/20 px-3 py-2 rounded-lg transition"
              >
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <UserIcon className="w-5 h-5 text-white" />
                </div>
                <span className="hidden md:inline text-sm">{userProfile?.display_name || user?.email?.split('@')[0] || 'User'}</span>
              </button>
              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 py-2">
                    <div className="px-4 py-2 border-b border-slate-700">
                      <p className="text-sm font-medium text-white">{userProfile?.display_name || 'User'}</p>
                      <p className="text-xs text-gray-400">{user?.email || ''}</p>
                    </div>
                    <button
                      onClick={() => { navigate('/my-trips'); setShowUserMenu(false); }}
                      className="w-full text-left px-4 py-2 text-blue-200 hover:text-white hover:bg-blue-500/20 text-sm transition"
                    >
                      My Trips
                    </button>
                    <button
                      onClick={() => { navigate('/fish-guide'); setShowUserMenu(false); }}
                      className="w-full text-left px-4 py-2 text-blue-200 hover:text-white hover:bg-blue-500/20 text-sm transition"
                    >
                      Fish Guide
                    </button>
                    <button
                      onClick={() => { navigate('/my-catches'); setShowUserMenu(false); }}
                      className="w-full text-left px-4 py-2 text-blue-200 hover:text-white hover:bg-blue-500/20 text-sm transition"
                    >
                      Catch Log
                    </button>
                    <div className="border-t border-slate-700 mt-1 pt-1">
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 text-sm transition flex items-center gap-2"
                      >
                        <LogOutIcon className="w-4 h-4" /> Sign Out
                      </button>
                      <button
                        onClick={() => { setShowUserMenu(false); setDeleteAccountError(null); setShowDeleteAccount(true); }}
                        className="w-full text-left px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 text-sm transition flex items-center gap-2"
                      >
                        <TrashIcon className="w-4 h-4" /> Delete Account
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-12 md:py-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/50 via-slate-900/30 to-slate-900" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 rounded-full px-4 py-2 mb-6">
            <FishIcon className="w-4 h-4 text-blue-400" />
            <span className="text-blue-300 text-sm font-medium">Personal Catch Journal</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-4">
            My <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">Catch Log</span>
          </h2>
          <p className="text-xl text-blue-200 mb-8 max-w-2xl mx-auto">
            Track every catch, monitor your personal bests, and build your fishing journal.
          </p>
          <button
            onClick={() => { setEditEntry(null); setShowFormModal(true); }}
            className="bg-blue-500 hover:bg-blue-600 text-white text-sm md:text-lg px-8 py-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all hover:shadow-blue-500/50 hover:scale-105 font-medium inline-flex items-center gap-2"
          >
            <PlusIcon className="w-5 h-5" />
            Log New Catch
          </button>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <SpinnerIcon className="w-8 h-8 text-blue-400 mr-3" />
            <span className="text-blue-300 text-lg">Loading your catches...</span>
          </div>
        ) : (
          <>
            {/* Stats Dashboard */}
            {catches.length > 0 && (
              <section className="mb-8">
                <Suspense fallback={<div className="text-blue-300 text-center py-4">Loading stats...</div>}>
                  <CatchStats catches={catches} />
                </Suspense>
              </section>
            )}

            {/* Search and Filters */}
            {catches.length > 0 && (
              <section className="mb-6">
                <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2 relative">
                      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        placeholder="Search catches..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-gray-400 h-10"
                      />
                    </div>
                    <select
                      value={filterSpecies}
                      onChange={e => setFilterSpecies(e.target.value)}
                      className="h-10 rounded-md border border-slate-600 bg-slate-700/50 text-white px-3 text-sm"
                    >
                      <option value="all">All Species</option>
                      {uniqueSpecies.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value)}
                      className="h-10 rounded-md border border-slate-600 bg-slate-700/50 text-white px-3 text-sm"
                    >
                      <option value="date-desc">Newest First</option>
                      <option value="date-asc">Oldest First</option>
                      <option value="weight-desc">Heaviest First</option>
                      <option value="length-desc">Longest First</option>
                      <option value="species">Species A-Z</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                    <p className="text-blue-300 text-sm">
                      Showing <span className="text-white font-semibold">{filteredCatches.length}</span> of{' '}
                      <span className="text-white font-semibold">{catches.length}</span> catches
                    </p>
                    <div className="flex items-center gap-2">
                      {(searchQuery || filterSpecies !== 'all') && (
                        <button
                          onClick={() => { setSearchQuery(''); setFilterSpecies('all'); }}
                          className="text-blue-300 hover:text-white hover:bg-blue-500/20 h-8 px-3 text-xs rounded-md transition flex items-center gap-1"
                        >
                          <XIcon className="w-3 h-3" /> Clear Filters
                        </button>
                      )}
                      <div className="flex bg-slate-700/50 rounded-lg overflow-hidden">
                        <button
                          onClick={() => setViewMode('grid')}
                          className={`px-3 py-1.5 text-xs transition ${viewMode === 'grid' ? 'bg-blue-500 text-white' : 'text-blue-300 hover:text-white'}`}
                        >
                          Grid
                        </button>
                        <button
                          onClick={() => setViewMode('list')}
                          className={`px-3 py-1.5 text-xs transition ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'text-blue-300 hover:text-white'}`}
                        >
                          List
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Catches Grid/List */}
            {filteredCatches.length > 0 ? (
              viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredCatches.map(entry => (
                    <div
                      key={entry.id}
                      className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl hover:bg-white/15 transition-all group cursor-pointer hover:scale-[1.01] hover:shadow-xl hover:shadow-blue-500/10 relative overflow-hidden"
                      onClick={() => setViewEntry(entry)}
                    >
                      {entry.is_personal_best && (
                        <div className="absolute top-3 right-3 z-10">
                          <Badge className="bg-amber-500 text-white shadow-lg">
                            <TrophyIcon className="w-3 h-3 mr-1" /> PB
                          </Badge>
                        </div>
                      )}

                      {entry.photo_url ? (
                        <div className="h-44 overflow-hidden">
                          <img
                            src={entry.photo_url}
                            alt={entry.species || 'Catch'}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      ) : (
                        <div className="h-28 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 flex items-center justify-center">
                          <FishIcon className="w-12 h-12 text-blue-400/40" />
                        </div>
                      )}

                      <div className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="text-lg font-bold text-white group-hover:text-blue-300 transition">
                            {entry.species || 'Unknown Species'}
                          </h3>
                        </div>

                        <div className="flex items-center gap-2 text-blue-300 text-sm mb-3">
                          <CalendarIcon className="w-3.5 h-3.5" />
                          {formatDate(entry.date)}
                        </div>

                        <div className="flex flex-wrap gap-3 mb-3">
                          {toNum(entry.weight_lbs) > 0 && (
                            <div className="flex items-center gap-1 text-sm">
                              <ScaleIcon className="w-3.5 h-3.5 text-green-400" />
                              <span className="text-white font-medium">{toNum(entry.weight_lbs).toFixed(1)} lbs</span>
                            </div>
                          )}
                          {toNum(entry.length_inches) > 0 && (
                            <div className="flex items-center gap-1 text-sm">
                              <RulerIcon className="w-3.5 h-3.5 text-teal-400" />
                              <span className="text-white font-medium">{toNum(entry.length_inches).toFixed(1)}"</span>
                            </div>
                          )}
                          {entry.catch_and_release && (
                            <Badge variant="outline" className="text-green-300 border-green-400/40 text-[10px]">
                              <RotateIcon className="w-2.5 h-2.5 mr-0.5" /> C&R
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-blue-300 text-sm mb-2">
                          <MapPinIcon className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{entry.location || 'Unknown'}{entry.state ? `, ${entry.state}` : ''}</span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {entry.method && entry.method !== 'none' && (
                            <Badge variant="outline" className="text-blue-200 border-blue-400/30 text-[10px]">
                              {entry.method}
                            </Badge>
                          )}
                          {entry.weather && entry.weather !== 'none' && (
                            <Badge variant="outline" className="text-blue-200 border-blue-400/30 text-[10px]">
                              {entry.weather}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredCatches.map(entry => (
                    <div
                      key={entry.id}
                      className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg hover:bg-white/15 transition-all cursor-pointer group flex items-center gap-4 p-4"
                      onClick={() => setViewEntry(entry)}
                    >
                      {entry.photo_url ? (
                        <img
                          src={entry.photo_url}
                          alt={entry.species || 'Catch'}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                          <FishIcon className="w-7 h-7 text-blue-400/40" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-white font-semibold group-hover:text-blue-300 transition truncate">
                            {entry.species || 'Unknown'}
                          </h3>
                          {entry.is_personal_best && <TrophyIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-blue-300 mt-0.5">
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3" /> {formatDate(entry.date)}
                          </span>
                          <span className="flex items-center gap-1 truncate">
                            <MapPinIcon className="w-3 h-3" /> {entry.location || 'Unknown'}
                          </span>
                        </div>
                      </div>

                      <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
                        {toNum(entry.weight_lbs) > 0 && (
                          <div className="text-center">
                            <p className="text-white font-semibold">{toNum(entry.weight_lbs).toFixed(1)}</p>
                            <p className="text-blue-400 text-[10px]">lbs</p>
                          </div>
                        )}
                        {toNum(entry.length_inches) > 0 && (
                          <div className="text-center">
                            <p className="text-white font-semibold">{toNum(entry.length_inches).toFixed(1)}"</p>
                            <p className="text-blue-400 text-[10px]">inches</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : catches.length === 0 ? (
              <div className="text-center py-20">
                <div className="bg-white/5 rounded-2xl border border-white/10 p-12 max-w-lg mx-auto">
                  <FishIcon className="w-20 h-20 text-blue-400/30 mx-auto mb-6" />
                  <h3 className="text-2xl font-bold text-white mb-3">No Catches Yet</h3>
                  <p className="text-blue-300 mb-8">
                    Start building your fishing journal! Log your first catch and track your progress over time.
                  </p>
                  <button
                    onClick={() => { setEditEntry(null); setShowFormModal(true); }}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-lg text-sm md:text-lg font-medium transition inline-flex items-center gap-2"
                  >
                    <PlusIcon className="w-5 h-5" />
                    Log Your First Catch
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-16">
                <SearchIcon className="w-12 h-12 text-blue-400/40 mx-auto mb-4" />
                <h3 className="text-xl text-white mb-2">No catches match your filters</h3>
                <p className="text-blue-300 mb-4">Try adjusting your search or filters</p>
                <button
                  onClick={() => { setSearchQuery(''); setFilterSpecies('all'); }}
                  className="border border-blue-400 text-blue-300 hover:bg-blue-500/20 px-6 py-2 rounded-lg text-sm transition"
                >
                  Clear Filters
                </button>
              </div>
            )}

            {/* Floating Add Button */}
            {catches.length > 0 && (
              <div className="fixed bottom-8 right-8 z-40">
                <button
                  onClick={() => { setEditEntry(null); setShowFormModal(true); }}
                  className="bg-blue-500 hover:bg-blue-600 text-white rounded-full w-14 h-14 shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 transition-all hover:scale-110 flex items-center justify-center"
                >
                  <PlusIcon className="w-6 h-6" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail View Modal */}
      {viewEntry && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewEntry(null)}>
          <div className="bg-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {viewEntry.photo_url && (
              <div className="relative h-64 overflow-hidden rounded-t-2xl">
                <img
                  src={viewEntry.photo_url}
                  alt={viewEntry.species || 'Catch'}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-800 via-transparent to-transparent" />
              </div>
            )}

            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {viewEntry.is_personal_best && (
                      <Badge className="bg-amber-500 text-white">
                        <TrophyIcon className="w-3 h-3 mr-1" /> Personal Best
                      </Badge>
                    )}
                    {viewEntry.catch_and_release && (
                      <Badge className="bg-green-500/20 text-green-300 border-green-400/30">
                        <RotateIcon className="w-3 h-3 mr-1" /> Catch & Release
                      </Badge>
                    )}
                  </div>
                  <h2 className="text-3xl font-bold text-white">{viewEntry.species || 'Unknown'}</h2>
                  <p className="text-blue-300 mt-1">{formatDate(viewEntry.date)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditEntry(viewEntry); setShowFormModal(true); setViewEntry(null); }}
                    className="text-blue-300 hover:text-white hover:bg-blue-500/20 p-2 rounded-lg transition"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(viewEntry.id); }}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/20 p-2 rounded-lg transition"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                  <button onClick={() => setViewEntry(null)} className="text-gray-400 hover:text-white p-2 rounded-lg transition">
                    <XIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Measurements */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-700/50 rounded-xl p-4 text-center">
                  <ScaleIcon className="w-6 h-6 text-green-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">
                    {toNum(viewEntry.weight_lbs) > 0 ? `${toNum(viewEntry.weight_lbs).toFixed(2)} lbs` : '\u2014'}
                  </p>
                  <p className="text-blue-300 text-xs">Weight</p>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-4 text-center">
                  <RulerIcon className="w-6 h-6 text-teal-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">
                    {toNum(viewEntry.length_inches) > 0 ? `${toNum(viewEntry.length_inches).toFixed(1)}"` : '\u2014'}
                  </p>
                  <p className="text-blue-300 text-xs">Length</p>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-3 mb-6">
                <div className="bg-slate-700/50 rounded-lg p-3 flex items-center gap-3">
                  <MapPinIcon className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">{viewEntry.location || 'Unknown'}</p>
                    <p className="text-blue-300 text-xs">
                      {[viewEntry.state, viewEntry.water_body && viewEntry.water_body !== 'none' ? viewEntry.water_body : null].filter(Boolean).join(' \u00B7 ') || 'Location'}
                    </p>
                  </div>
                </div>

                {viewEntry.method && viewEntry.method !== 'none' && (
                  <div className="bg-slate-700/50 rounded-lg p-3 flex items-center gap-3">
                    <AnchorIcon className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    <div>
                      <p className="text-white font-medium">{viewEntry.method}</p>
                      <p className="text-blue-300 text-xs">Fishing Method</p>
                    </div>
                  </div>
                )}

                {viewEntry.lure_bait && (
                  <div className="bg-slate-700/50 rounded-lg p-3 flex items-center gap-3">
                    <FishIcon className="w-5 h-5 text-amber-400 flex-shrink-0" />
                    <div>
                      <p className="text-white font-medium">{viewEntry.lure_bait}</p>
                      <p className="text-blue-300 text-xs">Lure / Bait</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  {viewEntry.time_of_day && viewEntry.time_of_day !== 'none' && (
                    <div className="bg-slate-700/50 rounded-lg p-3 flex items-center gap-3 flex-1">
                      <ClockIcon className="w-5 h-5 text-purple-400 flex-shrink-0" />
                      <div>
                        <p className="text-white font-medium text-sm">{viewEntry.time_of_day}</p>
                        <p className="text-blue-300 text-[10px]">Time</p>
                      </div>
                    </div>
                  )}
                  {viewEntry.weather && viewEntry.weather !== 'none' && (
                    <div className="bg-slate-700/50 rounded-lg p-3 flex items-center gap-3 flex-1">
                      <CloudIcon className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                      <div>
                        <p className="text-white font-medium text-sm">{viewEntry.weather}</p>
                        <p className="text-blue-300 text-[10px]">Weather</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {viewEntry.notes && (
                <div className="bg-blue-500/10 border border-blue-400/20 rounded-lg p-4 mb-6">
                  <p className="text-blue-300 text-xs font-medium uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-blue-100 text-sm whitespace-pre-wrap">{viewEntry.notes}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setEditEntry(viewEntry); setShowFormModal(true); setViewEntry(null); }}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2.5 rounded-lg font-medium transition flex items-center justify-center gap-2"
                >
                  <PencilIcon className="w-4 h-4" /> Edit Catch
                </button>
                <button
                  onClick={() => setDeleteConfirm(viewEntry.id)}
                  className="border border-red-400/50 text-red-300 hover:bg-red-500/20 px-6 py-2.5 rounded-lg font-medium transition flex items-center gap-2"
                >
                  <TrashIcon className="w-4 h-4" /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-slate-800 rounded-xl p-6 max-w-sm w-full border border-slate-700" onClick={e => e.stopPropagation()}>
            <TrashIcon className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white text-center mb-2">Delete This Catch?</h3>
            <p className="text-blue-300 text-center text-sm mb-6">
              This action cannot be undone. The catch entry and its photo will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-lg font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
                disabled={deleting}
              >
                {deleting ? <SpinnerIcon className="w-4 h-4" /> : <TrashIcon className="w-4 h-4" />}
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 border border-slate-600 text-gray-300 hover:bg-slate-700 py-2.5 rounded-lg font-medium transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation */}
      {showDeleteAccount && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => { if (!deletingAccount) setShowDeleteAccount(false); }}>
          <div className="bg-slate-800 rounded-xl p-6 max-w-sm w-full border border-slate-700" onClick={e => e.stopPropagation()}>
            <TrashIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white text-center mb-2">Delete Your Account?</h3>
            <p className="text-blue-300 text-center text-sm mb-4">
              This permanently deletes your account{user?.email ? ` (${user.email})` : ''} and all data — favorites, catch log, photos, and trips. This cannot be undone.
            </p>
            {deleteAccountError && (
              <p className="text-red-400 text-center text-xs mb-4">{deleteAccountError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {deletingAccount ? <SpinnerIcon className="w-4 h-4" /> : <TrashIcon className="w-4 h-4" />}
                {deletingAccount ? 'Deleting...' : 'Delete Permanently'}
              </button>
              <button
                onClick={() => setShowDeleteAccount(false)}
                disabled={deletingAccount}
                className="flex-1 border border-slate-600 text-gray-300 hover:bg-slate-700 py-2.5 rounded-lg font-medium transition disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal - Lazy loaded */}
      <Suspense fallback={null}>
        {user && showFormModal && (
          <CatchFormModal
            isOpen={showFormModal}
            onClose={() => { setShowFormModal(false); setEditEntry(null); }}
            onSave={() => { if (user?.id) fetchCatches(user.id); }}
            editEntry={editEntry}
            userId={user.id}
          />
        )}
      </Suspense>

      {/* Auth Modal - Lazy loaded */}
      <Suspense fallback={null}>
        {showAuthModal && (
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onAuthSuccess={() => setShowAuthModal(false)}
          />
        )}
      </Suspense>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-blue-500/20 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg">
                  <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
                </div>
                <span className="text-lg font-bold text-white">FishingFinderUSA</span>
              </div>
              <p className="text-blue-300 text-sm">
                Track your catches, find fishing spots, and explore species across all 50 states.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Explore</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                <li><button onClick={() => navigate('/')} className="hover:text-white transition">Fishing Spots</button></li>
                <li><button onClick={() => navigate('/fish-guide')} className="hover:text-white transition">Fish Species Guide</button></li>
                <li><button onClick={() => navigate('/licenses')} className="hover:text-white transition">Fishing Licenses</button></li>
                <li><button onClick={() => navigate('/regulations')} className="hover:text-white transition">Lodging/Regulations</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">My Account</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                <li><span className="text-white font-medium">My Catch Log</span></li>
                <li><button onClick={() => navigate('/my-trips')} className="hover:text-white transition">My Trips</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Catch Log</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                <li><button onClick={() => { setEditEntry(null); setShowFormModal(true); }} className="hover:text-white transition">Log New Catch</button></li>
                <li><button onClick={() => setSortBy('weight-desc')} className="hover:text-white transition">Biggest Catches</button></li>
                <li><button onClick={() => setSortBy('date-desc')} className="hover:text-white transition">Recent Catches</button></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-blue-500/20 mt-8 pt-8 text-center text-blue-300 text-sm">
            <p>&copy; 2026 FishingFinderUSA. All rights reserved. Always check local regulations before fishing.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MyCatches;
