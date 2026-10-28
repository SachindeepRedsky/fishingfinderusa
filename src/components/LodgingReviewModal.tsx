import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { Star, Loader2, Calendar, MessageSquare, Send, CheckCircle } from 'lucide-react';

interface LodgingReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  lodgingId: number;
  lodgingName: string;
  onReviewSubmitted: () => void;
}

const LodgingReviewModal: React.FC<LodgingReviewModalProps> = ({
  isOpen,
  onClose,
  lodgingId,
  lodgingName,
  onReviewSubmitted,
}) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [stayDate, setStayDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

  const resetForm = () => {
    setRating(0);
    setHoverRating(0);
    setReviewText('');
    setStayDate('');
    setError('');
    setSuccess(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (rating === 0) {
      setError('Please select a star rating.');
      return;
    }
    if (reviewText.trim().length < 10) {
      setError('Please write at least 10 characters in your review.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('You must be signed in to write a review.');
        setLoading(false);
        return;
      }

      // Get display name from user metadata or profile
      let displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Anonymous';

      // Try to get from profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();

      if (profile?.display_name) {
        displayName = profile.display_name;
      }

      const reviewData: any = {
        lodging_id: lodgingId,
        user_id: user.id,
        user_display_name: displayName,
        rating,
        review_text: reviewText.trim(),
      };

      if (stayDate) {
        reviewData.stay_date = stayDate;
      }

      const { error: insertError } = await supabase
        .from('lodging_reviews')
        .insert(reviewData);

      if (insertError) throw insertError;

      setSuccess(true);
      setTimeout(() => {
        onReviewSubmitted();
        handleClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error submitting review:', err);
      setError(err.message || 'Failed to submit review. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const displayRating = hoverRating || rating;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center flex items-center justify-center gap-2 text-white">
            <MessageSquare className="w-5 h-5 text-amber-400" />
            Write a Review
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Review Submitted!</h3>
            <p className="text-blue-300 text-sm">Thank you for sharing your experience at {lodgingName}.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 mt-2">
            {/* Lodging Name */}
            <div className="bg-slate-700/50 rounded-lg px-4 py-3">
              <p className="text-blue-300 text-xs uppercase tracking-wide mb-1">Reviewing</p>
              <p className="text-white font-semibold">{lodgingName}</p>
            </div>

            {/* Star Rating */}
            <div>
              <Label className="text-blue-200 text-sm mb-3 block">Your Rating</Label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 transition-transform hover:scale-110 focus:outline-none"
                  >
                    <Star
                      className={`w-8 h-8 transition-colors ${
                        star <= displayRating
                          ? 'text-yellow-400 fill-yellow-400'
                          : 'text-gray-500 hover:text-gray-400'
                      }`}
                    />
                  </button>
                ))}
                {displayRating > 0 && (
                  <span className="ml-3 text-sm font-medium">
                    <span className="text-yellow-400">{displayRating}/5</span>
                    <span className="text-blue-300 ml-1.5">— {ratingLabels[displayRating]}</span>
                  </span>
                )}
              </div>
              {rating === 0 && error.includes('star') && (
                <p className="text-red-400 text-xs mt-1">Please select a rating</p>
              )}
            </div>

            {/* Review Text */}
            <div>
              <Label htmlFor="reviewText" className="text-blue-200 text-sm mb-2 block">
                Your Review
              </Label>
              <Textarea
                id="reviewText"
                placeholder="Share your experience... How was the fishing? Were the accommodations comfortable? Would you recommend this place to other anglers?"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder:text-gray-400 min-h-[120px] resize-none"
                maxLength={1000}
              />
              <div className="flex justify-between mt-1">
                <p className="text-gray-500 text-xs">
                  {reviewText.length < 10 ? `${10 - reviewText.length} more characters needed` : 'Looks good!'}
                </p>
                <p className="text-gray-500 text-xs">{reviewText.length}/1000</p>
              </div>
            </div>

            {/* Stay Date */}
            <div>
              <Label htmlFor="stayDate" className="text-blue-200 text-sm mb-2 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Date of Stay <span className="text-gray-500">(optional)</span>
              </Label>
              <Input
                id="stayDate"
                type="date"
                value={stayDate}
                onChange={(e) => setStayDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="bg-slate-700 border-slate-600 text-white w-full"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 border-slate-600 text-gray-300 hover:bg-slate-700 rounded-md border"
                disabled={loading}
              >
                Cancel
              </button>
              <Button
                type="submit"
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Submit Review
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LodgingReviewModal;
