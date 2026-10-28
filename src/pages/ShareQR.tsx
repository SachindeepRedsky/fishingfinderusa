import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Fish,
  ArrowLeft,
  Download,
  Copy,
  Check,
  Share2,
  Printer,
  ExternalLink,
  QrCode,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const SITE_URL = 'https://fishingfinderusa.com';

/**
 * Builds a QR code image URL using the public api.qrserver.com endpoint.
 * No API key required, returns a PNG.
 */
const buildQrUrl = (data: string, size = 600, margin = 2) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=${margin}&data=${encodeURIComponent(
    data
  )}&format=png&qzone=2&ecc=H`;

const ShareQR: React.FC = () => {
  const navigate = useNavigate();
  const [target, setTarget] = useState(SITE_URL);
  const [copied, setCopied] = useState(false);

  const previewUrl = useMemo(() => buildQrUrl(target, 600), [target]);
  const downloadUrl = useMemo(() => buildQrUrl(target, 1200), [target]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      toast({ title: 'Link copied', description: target });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  };

  const handleDownload = async () => {
    try {
      const res = await fetch(downloadUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fishingfinderusa-qr.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'QR code downloaded', description: 'fishingfinderusa-qr.png' });
    } catch {
      // fallback: open in new tab
      window.open(downloadUrl, '_blank');
    }
  };

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>FishingFinderUSA QR Code</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 48px; }
            h1 { font-size: 28px; margin-bottom: 4px; }
            p { color: #475569; margin-top: 0; }
            img { margin: 24px auto; display: block; }
            .url { font-family: monospace; font-size: 18px; color: #0f172a; }
          </style>
        </head>
        <body>
          <h1>FishingFinderUSA</h1>
          <p>Scan to find fishing spots in all 50 states</p>
          <img src="${downloadUrl}" alt="QR code" width="500" height="500" />
          <div class="url">${target}</div>
          <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'FishingFinderUSA',
          text: 'Find fishing spots in all 50 states',
          url: target,
        });
      } catch {
        /* user canceled */
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center md:justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="text-blue-200 hover:text-white hover:bg-blue-500/20 md:hidden"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
          </Button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 hover:opacity-80 transition"
          >
            <div className="p-2 rounded-lg">
              <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
            </div>
            <div className="text-left">
              <h1 className="text-xl font-bold text-white">FishingFinderUSA</h1>
              <p className="text-blue-300 text-xs">Share with QR code</p>
            </div>
          </button>
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="text-blue-200 hover:text-white hover:bg-blue-500/20 hidden md:flex"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">
        {/* Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-4 py-1.5 mb-4">
            <QrCode className="w-4 h-4 text-blue-300" />
            <span className="text-blue-200 text-sm font-medium">Share FishingFinderUSA</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Scan to Visit FishingFinderUSA
          </h2>
          <p className="text-blue-200 text-lg max-w-2xl mx-auto">
            Print this QR code, share it on social media, or display it at the bait shop —
            anyone who scans it goes straight to{' '}
            <span className="text-white font-semibold">fishingfinderusa.com</span>.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* QR Code Display */}
          <Card className="bg-white/5 backdrop-blur-sm border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-blue-300" />
                Your QR Code
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="bg-white p-6 rounded-2xl shadow-2xl shadow-blue-500/20 mb-6">
                <img
                  src={previewUrl}
                  alt={`QR code linking to ${target}`}
                  width={320}
                  height={320}
                  className="block"
                />
              </div>
              <div className="text-center mb-6">
                <p className="text-blue-200 text-sm mb-1">Points to</p>
                <a
                  href={target}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white font-mono text-sm md:text-base hover:text-blue-300 transition inline-flex items-center gap-1.5"
                >
                  {target}
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="grid grid-cols-2 gap-3 w-full">
                <Button
                  onClick={handleDownload}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download PNG
                </Button>
                <Button
                  onClick={handlePrint}
                  variant="outline"
                  className="border-blue-400/40 text-blue-200 bg-blue-500/10 hover:bg-blue-500/30"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  className="border-blue-400/40 text-blue-200 bg-blue-500/10 hover:bg-blue-500/30"
                >
                  {copied ? (
                    <Check className="w-4 h-4 mr-2 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 mr-2" />
                  )}
                  {copied ? 'Copied!' : 'Copy Link'}
                </Button>
                <Button
                  onClick={handleShare}
                  variant="outline"
                  className="border-blue-400/40 text-blue-200 bg-blue-500/10 hover:bg-blue-500/30"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Customize + Info */}
          <div className="space-y-6">
            <Card className="bg-white/5 backdrop-blur-sm border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Customize Destination</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-blue-200/80 text-sm">
                  By default this QR code links to the FishingFinderUSA homepage. You can
                  point it at any FishingFinderUSA page (for example a specific spot or the
                  pricing page).
                </p>
                <div>
                  <label className="text-blue-200 text-sm font-medium mb-2 block">
                    Target URL
                  </label>
                  <Input
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="https://fishingfinderusa.com"
                    className="bg-slate-800/60 border-slate-600 text-white placeholder:text-slate-500"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTarget(SITE_URL)}
                    className="border-blue-400/40 text-blue-200 bg-blue-500/10 text-xs hover:bg-blue-500/30"
                  >
                    Homepage
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTarget(`${SITE_URL}/pricing`)}
                    className="border-blue-400/40 text-blue-200 bg-blue-500/10 text-xs hover:bg-blue-500/30"
                  >
                    Pricing
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTarget(`${SITE_URL}/fish-guide`)}
                    className="border-blue-400/40 text-blue-200 bg-blue-500/10 text-xs hover:bg-blue-500/30"
                  >
                    Fish Guide
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTarget(`${SITE_URL}/licenses`)}
                    className="border-blue-400/40 text-blue-200 bg-blue-500/10 text-xs hover:bg-blue-500/30"
                  >
                    Licenses
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/5 backdrop-blur-sm border-blue-400/20">
              <CardHeader>
                <CardTitle className="text-white text-lg">How to use this QR code</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3 text-blue-100 text-sm">
                  <li className="flex gap-3">
                    <span className="bg-blue-500/30 text-blue-200 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
                      1
                    </span>
                    Click <span className="font-semibold">Download PNG</span> to save the
                    high-resolution QR image to your device.
                  </li>
                  <li className="flex gap-3">
                    <span className="bg-blue-500/30 text-blue-200 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
                      2
                    </span>
                    Add it to flyers, business cards, the side of your tackle box, or post
                    it at your local bait & tackle shop.
                  </li>
                  <li className="flex gap-3">
                    <span className="bg-blue-500/30 text-blue-200 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
                      3
                    </span>
                    Anyone who scans it with their phone camera will be taken straight to{' '}
                    <span className="font-mono">fishingfinderusa.com</span>.
                  </li>
                </ol>
              </CardContent>
            </Card>

            <Card className="bg-amber-500/10 border-amber-500/30">
              <CardContent className="pt-6">
                <p className="text-amber-200 text-sm leading-relaxed">
                  <span className="font-semibold text-amber-300">Tip:</span> The QR code
                  always points to the live <span className="font-mono">fishingfinderusa.com</span>{' '}
                  domain, so you can update the website's content without having to reprint
                  the code.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ShareQR;
