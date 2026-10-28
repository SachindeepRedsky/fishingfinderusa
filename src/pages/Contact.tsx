import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Fish, Mail, Phone, MessageSquare, Send, Loader2, MapPin } from 'lucide-react';

const CONTACT_PHONE_DISPLAY = '+1 (770) 374-5003';
const CONTACT_PHONE_RAW = '17703745003';
const CONTACT_EMAIL = 'brilansie_transp@bellsouth.net';

const Contact: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className= "min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-start justify-start">
        <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="text-blue-200 hover:text-white hover:bg-blue-500/20 flex items-center justify-between"
          >
            <ArrowLeft className="w-4 h-4 md:mr-2" />
          </Button>
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <div className="p-2 rounded-lg">
              <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
            </div>
            <div className="text-left">
              <h1 className="text-xl font-bold text-white">FishingFinderUSA</h1>
              <p className="text-blue-300 text-xs">Find fishing spots in all 50 states</p>
            </div>
          </button>
        </div>
      </header>

      <main className="flex flex-col justify-center items-center max-w-5xl mx-auto px-2 py-12">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-2">
            <MessageSquare className="w-6 h-6 text-blue-300" />
          </div>
          <h1 className="text-4xl font-bold text-white">Contact Us</h1>
        </div>
        <p className="text-center text-blue-300 mb-10 w-full">
          Have a question, suggestion, or need help with your account? Reach out — we'd love to hear from you.
        </p>
          {/* Contact details */}
          <div className="md:w-[50%] w-full flex flex-col justify-center gap-5">
            <a
              href={`tel:+${CONTACT_PHONE_RAW}`}
              className="flex items-start gap-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-blue-400/40 transition group"
            >
              <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-3 group-hover:scale-105 transition">
                <Phone className="w-6 h-6 text-green-300" />
              </div>
              <div>
                <p className="text-blue-300 text-sm uppercase tracking-wide mb-1">Call Us</p>
                <p className="text-white text-xl font-semibold">{CONTACT_PHONE_DISPLAY}</p>
                <p className="text-blue-200/70 text-sm mt-1">Tap to call on mobile</p>
              </div>
            </a>

            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex items-start gap-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-blue-400/40 transition group"
            >
              <div className="bg-blue-500/20 border border-blue-500/30 rounded-xl p-3 group-hover:scale-105 transition">
                <Mail className="w-6 h-6 text-blue-300" />
              </div>
              <div>
                <p className="text-blue-300 text-sm uppercase tracking-wide mb-1">Email Us</p>
                <p className="text-white text-lg font-semibold break-all">{CONTACT_EMAIL}</p>
                <p className="text-blue-200/70 text-sm mt-1">We typically reply within 1–2 business days</p>
              </div>
            </a>
          </div>

        
      </main>
    </div>
  );
};

export default Contact;
