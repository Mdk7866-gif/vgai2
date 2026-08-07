"use client";

import React, { useState } from "react";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";
import ConformationMessagePopUp from "@/components/ConformationMessagePopUp";
import ImageZoomPopUp from "@/components/ImageZoomPopUp";
import { Plus, Play, Sparkles, Image as ImageIcon, HelpCircle, AlertCircle } from "lucide-react";

export default function Home() {
  const [showAlert, setShowAlert] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showImageZoom, setShowImageZoom] = useState(false);

  return (
    <div className="flex flex-col gap-10 pb-16 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome to vgAI
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400 text-[15px] max-w-xl leading-relaxed">
            Create a project, paste your script, and let AI generate a fully structured scene-by-scene workflow.
          </p>
        </div>
        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 dark:hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium shadow-md shadow-indigo-200 dark:shadow-indigo-900/40 transition-all active:scale-95 w-full sm:w-auto justify-center cursor-pointer ring-1 ring-indigo-700 dark:ring-indigo-500">
          <Plus className="w-5 h-5" />
          <span>New Project</span>
        </button>
      </div>

      {/* Feature highlight */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1 */}
        <div className="group bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 p-7 rounded-2xl shadow-sm hover:shadow-lg dark:hover:shadow-slate-900/50 hover:-translate-y-0.5 transition-all duration-200 backdrop-blur-sm">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mb-5 group-hover:scale-105 transition-transform duration-200">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-[17px] text-slate-900 dark:text-slate-100">AI Scene Breakdown</h3>
          <p className="mt-2.5 text-slate-500 dark:text-slate-400 text-[14px] leading-relaxed">
            Automatically analyze long scripts and break them into a scene-by-scene structure for easy editing.
          </p>
        </div>

        {/* Card 2 */}
        <div className="group bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 p-7 rounded-2xl shadow-sm hover:shadow-lg dark:hover:shadow-slate-900/50 hover:-translate-y-0.5 transition-all duration-200 backdrop-blur-sm">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center mb-5 group-hover:scale-105 transition-transform duration-200">
            <Play className="w-6 h-6 ml-1" />
          </div>
          <h3 className="font-semibold text-[17px] text-slate-900 dark:text-slate-100">Multi-Modal Generation</h3>
          <p className="mt-2.5 text-slate-500 dark:text-slate-400 text-[14px] leading-relaxed">
            Generate image prompts, animations, and voiceovers for each scene to bring your script to life.
          </p>
        </div>

        {/* Card 3 */}
        <div className="group bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 p-7 rounded-2xl shadow-sm hover:shadow-lg dark:hover:shadow-slate-900/50 hover:-translate-y-0.5 transition-all duration-200 backdrop-blur-sm">
          <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center mb-5 group-hover:scale-105 transition-transform duration-200">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </div>
          <h3 className="font-semibold text-[17px] text-slate-900 dark:text-slate-100">Reusable Assets</h3>
          <p className="mt-2.5 text-slate-500 dark:text-slate-400 text-[14px] leading-relaxed">
            Store consistent characters and prompt templates to ensure visual continuity across future projects.
          </p>
        </div>
      </div>

      {/* Component Testing Section */}
      <div className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-md dark:hover:shadow-slate-900/40 transition-shadow backdrop-blur-sm">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700/60">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Interactive Components</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Test the newly created responsive UI modals with dummy data.</p>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-900/30">
          <button 
            onClick={() => setShowAlert(true)}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600/60 rounded-xl shadow-sm hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all font-medium text-slate-700 dark:text-slate-200 active:scale-95 cursor-pointer"
          >
            <AlertCircle className="w-4 h-4 text-slate-400 dark:text-slate-400" />
            Alert Modal
          </button>
          
          <button 
            onClick={() => setShowConfirm(true)}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600/60 rounded-xl shadow-sm hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all font-medium text-slate-700 dark:text-slate-200 active:scale-95 cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-slate-400 dark:text-slate-400" />
            Confirmation Modal
          </button>
          
          <button 
            onClick={() => setShowImageZoom(true)}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600/60 rounded-xl shadow-sm hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all font-medium text-slate-700 dark:text-slate-200 active:scale-95 cursor-pointer"
          >
            <ImageIcon className="w-4 h-4 text-slate-400 dark:text-slate-400" />
            Image Zoom
          </button>
        </div>
      </div>

      {/* Popups */}
      <AlertMessagePopUp 
        isOpen={showAlert} 
        onClose={() => setShowAlert(false)} 
        title="Scene Breakdown Complete" 
        message="Your script has been successfully analyzed and broken down into 12 editable scenes. You can now start assigning characters and generating prompts."
        type="success"
      />
      
      <ConformationMessagePopUp 
        isOpen={showConfirm} 
        onClose={() => setShowConfirm(false)} 
        onConfirm={() => { console.log("Confirmed"); setShowConfirm(false); }}
        title="Delete Scene" 
        message="Are you sure you want to delete this scene? This action cannot be undone and you will lose any generated prompts and images associated with it."
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
      />
      
      <ImageZoomPopUp 
        isOpen={showImageZoom} 
        onClose={() => setShowImageZoom(false)} 
        imageUrl="https://res.cloudinary.com/ddya4o2yl/image/upload/v1760289936/WhatsApp_Image_2025-10-12_at_23.01.18_ea645293_xgycdn.jpg"
        alt="Dummy generated scene image"
      />
    </div>
  );
}


