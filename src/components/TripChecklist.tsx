import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  CheckSquare, Square, Plus, Trash2, Loader2, ChevronDown, ChevronUp,
  Package
} from 'lucide-react';
import { checklistCategories } from '@/data/defaultChecklist';

interface ChecklistItem {
  id: string;
  trip_id: string;
  text: string;
  is_checked: boolean;
  category: string;
  sort_order: number;
}

interface TripChecklistProps {
  tripId: string;
  readOnly?: boolean;
}

const categoryColors: Record<string, string> = {
  'Fishing Gear': 'bg-blue-500/20 text-blue-300 border-blue-400/30',
  'Safety': 'bg-red-500/20 text-red-300 border-red-400/30',
  'Essentials': 'bg-green-500/20 text-green-300 border-green-400/30',
  'Clothing': 'bg-purple-500/20 text-purple-300 border-purple-400/30',
  'Extras': 'bg-amber-500/20 text-amber-300 border-amber-400/30',
  'Custom': 'bg-cyan-500/20 text-cyan-300 border-cyan-400/30',
};

const TripChecklist: React.FC<TripChecklistProps> = ({ tripId, readOnly = false }) => {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemText, setNewItemText] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Custom');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [addingItem, setAddingItem] = useState(false);

  useEffect(() => {
    fetchChecklist();
  }, [tripId]);

  const fetchChecklist = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trip_checklist_items')
        .select('*')
        .eq('trip_id', tripId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error('Error fetching checklist:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = async (item: ChecklistItem) => {
    if (readOnly) return;
    const newChecked = !item.is_checked;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_checked: newChecked } : i));

    await supabase
      .from('trip_checklist_items')
      .update({ is_checked: newChecked })
      .eq('id', item.id);
  };

  const addItem = async () => {
    if (!newItemText.trim() || readOnly) return;
    setAddingItem(true);

    try {
      const { data, error } = await supabase
        .from('trip_checklist_items')
        .insert({
          trip_id: tripId,
          text: newItemText.trim(),
          category: newItemCategory,
          is_checked: false,
          sort_order: items.length,
        })
        .select()
        .single();

      if (error) throw error;
      if (data) setItems(prev => [...prev, data]);
      setNewItemText('');
    } catch (err) {
      console.error('Error adding item:', err);
    } finally {
      setAddingItem(false);
    }
  };

  const deleteItem = async (itemId: string) => {
    if (readOnly) return;
    setItems(prev => prev.filter(i => i.id !== itemId));
    await supabase.from('trip_checklist_items').delete().eq('id', itemId);
  };

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-blue-400 animate-spin mr-2" />
        <span className="text-blue-300 text-sm">Loading checklist...</span>
      </div>
    );
  }

  const checkedCount = items.filter(i => i.is_checked).length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  // Group items by category
  const allCategories = [...checklistCategories, 'Custom'];
  const groupedItems: Record<string, ChecklistItem[]> = {};
  allCategories.forEach(cat => {
    const catItems = items.filter(i => i.category === cat);
    if (catItems.length > 0) groupedItems[cat] = catItems;
  });
  // Also add any categories not in our list
  items.forEach(item => {
    if (!allCategories.includes(item.category)) {
      if (!groupedItems[item.category]) groupedItems[item.category] = [];
      groupedItems[item.category].push(item);
    }
  });

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="bg-slate-700/50 rounded-xl p-4 border border-white/5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-white">Packing Progress</span>
          </div>
          <span className="text-sm text-blue-300">{checkedCount}/{totalCount} items</span>
        </div>
        <div className="w-full bg-slate-600 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${
              progressPercent === 100 ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {progressPercent === 100 && (
          <p className="text-green-400 text-xs mt-2 font-medium">All packed and ready to go!</p>
        )}
      </div>

      {/* Categories */}
      {Object.entries(groupedItems).map(([category, catItems]) => {
        const isCollapsed = collapsedCategories.has(category);
        const catChecked = catItems.filter(i => i.is_checked).length;
        const colorClass = categoryColors[category] || categoryColors['Custom'];

        return (
          <div key={category} className="bg-slate-700/30 rounded-xl border border-white/5 overflow-hidden">
            <button
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition"
            >
              <div className="flex items-center gap-2">
                <Badge className={`text-xs border ${colorClass}`}>{category}</Badge>
                <span className="text-xs text-gray-400">{catChecked}/{catItems.length}</span>
              </div>
              {isCollapsed ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {!isCollapsed && (
              <div className="px-3 pb-3 space-y-1">
                {catItems.map(item => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-2 rounded-lg transition group ${
                      item.is_checked ? 'bg-green-500/5' : 'hover:bg-white/5'
                    }`}
                  >
                    <button
                      onClick={() => toggleItem(item)}
                      disabled={readOnly}
                      className="flex-shrink-0"
                    >
                      {item.is_checked ? (
                        <CheckSquare className="w-5 h-5 text-green-400" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-500 hover:text-blue-400 transition" />
                      )}
                    </button>
                    <span className={`flex-1 text-sm ${
                      item.is_checked ? 'text-gray-500 line-through' : 'text-white'
                    }`}>
                      {item.text}
                    </span>
                    {!readOnly && (
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-red-500/20 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Add Custom Item */}
      {!readOnly && (
        <div className="flex gap-2">
          <Input
            placeholder="Add custom item..."
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
            className="bg-slate-700 border-slate-600 text-white text-sm"
          />
          <select
            value={newItemCategory}
            onChange={(e) => setNewItemCategory(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded-md px-2 text-sm text-white"
          >
            {[...checklistCategories, 'Custom'].map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <Button
            onClick={addItem}
            disabled={!newItemText.trim() || addingItem}
            size="sm"
            className="bg-blue-500 hover:bg-blue-600 px-3"
          >
            {addingItem ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>
      )}
    </div>
  );
};

export default TripChecklist;
