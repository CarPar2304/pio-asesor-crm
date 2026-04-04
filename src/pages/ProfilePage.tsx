import { useState, useEffect } from 'react';
import { useProfile } from '@/contexts/ProfileContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Camera, Plus, X, Save, User, Settings2, Shield } from 'lucide-react';
import CompanyFitSettings from '@/components/admin/CompanyFitSettings';

export default function ProfilePage() {
  const { profile, segments, updateProfile, addSegment, removeSegment, isAdmin } = useProfile();
  const { session } = useAuth();

  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [segment, setSegment] = useState('');
  const [newSegment, setNewSegment] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setPosition(profile.position);
      setPhone(profile.phone);
      setSegment(profile.segment);
    }
  }, [profile]);

  const handleSave = async () => {
    await updateProfile({ name, position, phone, segment });
    showSuccess('Perfil actualizado', 'Los cambios se guardaron correctamente');
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${session.user.id}/avatar.${ext}`;

    await supabase.storage.from('company-logos').upload(path, file, { upsert: true });
    const { data } = supabase.storage.from('company-logos').getPublicUrl(path);
    await updateProfile({ avatarUrl: data.publicUrl + '?t=' + Date.now() });
    setUploading(false);
    showSuccess('Foto actualizada', 'Tu foto de perfil se actualizó correctamente');
  };

  const handleAddSegment = async () => {
    if (!newSegment.trim()) return;
    await addSegment(newSegment.trim());
    setNewSegment('');
  };

  const initials = name ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';

  const profileContent = (
    <div className="space-y-8">
      <div className="rounded-xl border border-border bg-card p-6 space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-20 w-20">
              <AvatarImage src={profile?.avatarUrl || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-lg">{initials}</AvatarFallback>
            </Avatar>
            <label className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors">
              <Camera className="h-3.5 w-3.5" />
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
            </label>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">{name || 'Sin nombre'}</p>
              {isAdmin && <Badge variant="default" className="text-[10px] gap-1"><Shield className="h-3 w-3" />Admin</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{session?.user.email}</p>
          </div>
        </div>

        {/* Form */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Nombre completo</Label>
            <Input className="mt-1" value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" />
          </div>
          <div>
            <Label>Cargo</Label>
            <Input className="mt-1" value={position} onChange={e => setPosition(e.target.value)} placeholder="Tu cargo" />
          </div>
          <div>
            <Label>Celular</Label>
            <Input className="mt-1" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+57 ..." />
          </div>
          <div>
            <Label>Segmento asignado</Label>
            <Select value={segment} onValueChange={setSegment}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona segmento" /></SelectTrigger>
              <SelectContent>
                {segments.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={handleSave} className="gap-2">
          <Save className="h-4 w-4" /> Guardar cambios
        </Button>
      </div>

      {/* Segments management */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Segmentos disponibles</h2>
          <p className="text-xs text-muted-foreground">Administra los segmentos que pueden asignarse a usuarios</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {segments.map(s => (
            <Badge key={s.id} variant="secondary" className="gap-1 pr-1">
              {s.name}
              <button onClick={() => removeSegment(s.id)} className="ml-1 rounded-full p-0.5 hover:bg-background/50">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newSegment} onChange={e => setNewSegment(e.target.value)} placeholder="Nuevo segmento" className="max-w-xs" onKeyDown={e => e.key === 'Enter' && handleAddSegment()} />
          <Button size="sm" variant="outline" onClick={handleAddSegment} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Agregar
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Mi perfil</h1>
        <p className="text-sm text-muted-foreground">Actualiza tu información personal</p>
      </div>

      {isAdmin ? (
        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile" className="gap-1.5"><User className="h-3.5 w-3.5" />Perfil</TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5"><Settings2 className="h-3.5 w-3.5" />Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="profile">{profileContent}</TabsContent>
          <TabsContent value="settings">
            <CompanyFitSettings />
          </TabsContent>
        </Tabs>
      ) : (
        profileContent
      )}
    </div>
  );
}
