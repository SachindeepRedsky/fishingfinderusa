import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Check, Download, Share2, QrCode } from 'lucide-react';

interface SpotShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spotId: number;
  spotName: string;
  spotState: string;
}

const SpotShareDialog: React.FC<SpotShareDialogProps> = ({
  open,
  onOpenChange,
  spotId,
  spotName,
  spotState,
}) => {
  const [copied, setCopied] = useState(false);

  // Build the deep-link URL. Prefer the production domain so QR codes scanned
  // from print/share contexts always resolve, regardless of where the app
  // happens to be running.
  const shareUrl = useMemo(
    () => `https://fishingfinderusa.com/?spot=${spotId}`,
    [spotId]
  );

  // Same QR generation pattern used by ShareQR.tsx — api.qrserver.com.
  const qrSize = 360;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(
    shareUrl
  )}&margin=10&color=0F172A&bgcolor=FFFFFF`;

  // High-res variant used for download.
  const qrDownloadSrc = `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=${encodeURIComponent(
    shareUrl
  )}&margin=20&color=0F172A&bgcolor=FFFFFF&format=png`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — graceful fallback below
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = qrDownloadSrc;
    a.download = `fishingfinderusa-spot-${spotId}-${spotName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleNativeShare = async () => {
    const shareData = {
      title: `${spotName} — FishingFinderUSA`,
      text: `Check out this fishing spot: ${spotName}, ${spotState}`,
      url: shareUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user dismissed share sheet
      }
    } else {
      handleCopy();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <QrCode className="w-5 h-5 text-blue-400" />
            Share this spot
          </DialogTitle>
          <DialogDescription className="text-blue-200">
            Scan this QR code or copy the link to share <span className="font-semibold text-white">{spotName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-4">
          <div className="bg-white p-4 rounded-xl shadow-lg">
            <img
              src={qrSrc}
              alt={`QR code linking to ${spotName} on FishingFinderUSA`}
              width={qrSize}
              height={qrSize}
              className="block"
              loading="lazy"
            />
          </div>
          <p className="text-xs text-blue-300 mt-3 text-center">
            Opens directly to this spot on fishingfinderusa.com
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-blue-300 font-medium">
            Share Link
          </label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="bg-slate-900 border-slate-600 text-white text-sm font-mono"
            />
            <button
              onClick={handleCopy}
              className="border-blue-500/40 text-blue-300 hover:bg-blue-500/10 shrink-0 border rounded-lg p-2 flex items-center justify-center"
              aria-label="Copy link"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          {copied && <p className="text-xs text-green-400">Link copied to clipboard!</p>}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={handleDownload}
            className="border-blue-500/40 text-blue-300 hover:bg-blue-500/10 border rounded-lg p-2 flex items-center justify-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Download QR
          </button>
          <Button
            onClick={handleNativeShare}
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SpotShareDialog;
