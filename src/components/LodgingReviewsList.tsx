import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Star, Calendar, User, Loader2, ChevronDown, ThumbsUp, MessageSquare } from 'lucide-react';

interface Review {
  id: number;
  lodging_id: number;
  user_id: string;
  user_display_name: string;
  rating: number;
  review_text: string;
  stay_date: string | null;
  created_at: string;
}

interface LodgingReviewsListProps {
  lodgingId: number;
  refreshTrigger: number;
}

const renderStars = (rating: number, size: string = 'w-3.5 h-3.5') => {
  return Array.from({ length: 5 }, (_, i) => (
    <Star
      key={i}
      className={`${size} ${
        i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'
      }`}
    />
  ));
};

const getRatingColor = (rating: number): string => {
  if (rating >= 5) return 'bg-green-500';
  if (rating >= 4) return 'bg-emerald-500';
  if (rating >= 3) return 'bg-yellow-500';
  if (rating >= 2) return 'bg-orange-500';
  return 'bg-red-500';
};

const timeAgo = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`;
};

const LodgingReviewsList: React.FC<LodgingReviewsListProps> = ({ lodgingId, refreshTrigger }) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetchReviews();
  }, [lodgingId, refreshTrigger]);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lodging_reviews')
        .select('*')
        .eq('lodging_id', lodgingId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReviews(data || []);
    } catch (err) {
      console.error('Error fetching reviews:', err);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 text-blue-400 animate-spin mr-2" />
        <span className="text-blue-300 text-xs">Loading reviews...</span>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="text-center py-4">
        <MessageSquare className="w-8 h-8 text-gray-500 mx-auto mb-2" />
        <p className="text-gray-400 text-xs">No reviews yet. Be the first to share your experience!</p>
      </div>
    );
  }

  // Rating breakdown
  const ratingCounts = [0, 0, 0, 0, 0];
  reviews.forEach(r => {
    if (r.rating >= 1 && r.rating <= 5) {
      ratingCounts[r.rating - 1]++;
    }
  });
  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const displayedReviews = showAll ? reviews : reviews.slice(0, 3);

  return (
    <div className="space-y-3">
      {/* Rating Summary */}
      <div className="bg-white/5 rounded-lg p-3 border border-white/10">
        <div className="flex items-start gap-4">
          {/* Average Rating */}
          <div className="text-center flex-shrink-0">
            <p className="text-2xl font-bold text-white">{avgRating.toFixed(1)}</p>
            <div className="flex items-center gap-0.5 my-1">
              {renderStars(Math.round(avgRating), 'w-3 h-3')}
            </div>
            <p className="text-gray-400 text-[10px]">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</p>
          </div>

          {/* Rating Bars */}
          <div className="flex-1 space-y-1">
            {[5, 4, 3, 2, 1].map(star => {
              const count = ratingCounts[star - 1];
              const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-3 text-right">{star}</span>
                  <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 flex-shrink-0" />
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${getRatingColor(star)} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 w-5 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Individual Reviews */}
      <div className="space-y-2">
        {displayedReviews.map(review => (
          <div
            key={review.id}
            className="bg-white/5 rounded-lg p-3 border border-white/10 hover:border-white/15 transition"
          >
            {/* Review Header */}
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                  <User className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium leading-tight">{review.user_display_name}</p>
                  <p className="text-gray-500 text-[10px]">{timeAgo(review.created_at)}</p>
                </div>
              </div>
              <div className={`${getRatingColor(review.rating)} text-white text-xs font-bold px-2 py-0.5 rounded`}>
                {review.rating}.0
              </div>
            </div>

            {/* Stars */}
            <div className="flex items-center gap-1 mb-2">
              <div className="flex items-center gap-0.5">
                {renderStars(review.rating, 'w-3 h-3')}
              </div>
              {review.stay_date && (
                <span className="text-gray-500 text-[10px] ml-2 flex items-center gap-1">
                  <Calendar className="w-2.5 h-2.5" />
                  Stayed {new Date(review.stay_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>

            {/* Review Text */}
            <p className="text-blue-200/80 text-xs leading-relaxed">{review.review_text}</p>
          </div>
        ))}
      </div>

      {/* Show More */}
      {reviews.length > 3 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full flex items-center justify-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition py-1.5 bg-white/5 rounded-lg border border-white/10 hover:border-white/20"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          Show All {reviews.length} Reviews
        </button>
      )}
      {showAll && reviews.length > 3 && (
        <button
          onClick={() => setShowAll(false)}
          className="w-full flex items-center justify-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition py-1.5 bg-white/5 rounded-lg border border-white/10 hover:border-white/20"
        >
          Show Less
        </button>
      )}
    </div>
  );
};

export default LodgingReviewsList;
