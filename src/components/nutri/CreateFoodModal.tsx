import React, { useState } from 'react';
import { X, Loader2, Utensils } from 'lucide-react';
import * as nutritionApi from '../../lib/nutrition';
import type { Food } from '../../lib/nutrition';

interface CreateFoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (food: Food) => void;
}

export function CreateFoodModal({ isOpen, onClose, onSuccess }: CreateFoodModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    kcal: '',
    proteinG: '',
    carbsG: '',
    fatG: ''
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        name: formData.name,
        kcal: Number(formData.kcal),
        proteinG: Number(formData.proteinG),
        carbsG: Number(formData.carbsG),
        fatG: Number(formData.fatG)
      };

      const newFood = await nutritionApi.createCustomFood(payload);
      onSuccess(newFood);
      
      // Reset form
      setFormData({
        name: '',
        kcal: '',
        proteinG: '',
        carbsG: '',
        fatG: ''
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Erro ao criar alimento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md">
      <div 
        className="absolute inset-0"
        onClick={onClose}
      />
      
      <div className="relative bg-kindra-100 rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-kindra-200/50 flex flex-col max-h-[85vh] backdrop-blur-xl">
        <div className="p-6 sm:p-8 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-kindra-200/50 flex items-center justify-center text-teal-400 border border-kindra-300/30">
                <Utensils className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-display font-semibold text-kindra-950">Novo Alimento</h2>
                <p className="text-sm font-medium text-kindra-500 mt-0.5">Valores para uma porção de 100g</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2.5 text-kindra-400 hover:text-kindra-950 hover:bg-kindra-200/50 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-kindra-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-4 text-sm font-bold text-rose-400 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-kindra-500 uppercase tracking-widest ml-1">Nome do Alimento</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Ex: Arroz Branco Cozido"
                required
                className="w-full px-5 py-4 bg-kindra-200/50 border border-kindra-300/30 rounded-2xl text-kindra-950 placeholder:text-kindra-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all shadow-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-kindra-500 uppercase tracking-widest ml-1">Calorias (kcal)</label>
                <input
                  type="number"
                  name="kcal"
                  value={formData.kcal}
                  onChange={handleChange}
                  placeholder="0"
                  min="0"
                  max="900"
                  step="0.1"
                  required
                  className="w-full px-5 py-4 bg-kindra-200/50 border border-kindra-300/30 rounded-2xl text-kindra-950 placeholder:text-kindra-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all shadow-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-kindra-500 uppercase tracking-widest ml-1">Proteína (g)</label>
                <input
                  type="number"
                  name="proteinG"
                  value={formData.proteinG}
                  onChange={handleChange}
                  placeholder="0"
                  min="0"
                  max="100"
                  step="0.1"
                  required
                  className="w-full px-5 py-4 bg-kindra-200/50 border border-kindra-300/30 rounded-2xl text-kindra-950 placeholder:text-kindra-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all shadow-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-kindra-500 uppercase tracking-widest ml-1">Carboidratos (g)</label>
                <input
                  type="number"
                  name="carbsG"
                  value={formData.carbsG}
                  onChange={handleChange}
                  placeholder="0"
                  min="0"
                  max="100"
                  step="0.1"
                  required
                  className="w-full px-5 py-4 bg-kindra-200/50 border border-kindra-300/30 rounded-2xl text-kindra-950 placeholder:text-kindra-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all shadow-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-kindra-500 uppercase tracking-widest ml-1">Gorduras (g)</label>
                <input
                  type="number"
                  name="fatG"
                  value={formData.fatG}
                  onChange={handleChange}
                  placeholder="0"
                  min="0"
                  max="100"
                  step="0.1"
                  required
                  className="w-full px-5 py-4 bg-kindra-200/50 border border-kindra-300/30 rounded-2xl text-kindra-950 placeholder:text-kindra-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all shadow-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-8 flex items-center justify-center py-4 px-4 bg-teal-500 text-white rounded-2xl font-bold font-display text-lg tracking-wide hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-kindra-100 transition-all shadow-lg shadow-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                'Salvar Alimento'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
