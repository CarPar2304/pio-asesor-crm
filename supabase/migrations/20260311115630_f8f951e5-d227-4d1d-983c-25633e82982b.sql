
-- 1. Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  name text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  segment text NOT NULL DEFAULT '',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- 2. Segments table
CREATE TABLE public.segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read segments" ON public.segments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert segments" ON public.segments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can delete segments" ON public.segments FOR DELETE TO authenticated USING (true);

-- Insert default segments
INSERT INTO public.segments (name) VALUES ('EBT'), ('Startups'), ('Disruptivas');

-- 3. Add created_by to actions, milestones, tasks + assigned_to for tasks
ALTER TABLE public.company_actions ADD COLUMN created_by uuid REFERENCES auth.users(id);
ALTER TABLE public.milestones ADD COLUMN created_by uuid REFERENCES auth.users(id);
ALTER TABLE public.company_tasks ADD COLUMN created_by uuid REFERENCES auth.users(id);
ALTER TABLE public.company_tasks ADD COLUMN assigned_to uuid REFERENCES auth.users(id);

-- 4. Update existing records to cparedes
UPDATE public.company_actions SET created_by = 'bb045c54-9d36-48bf-adf2-e988284e7261' WHERE created_by IS NULL;
UPDATE public.milestones SET created_by = 'bb045c54-9d36-48bf-adf2-e988284e7261' WHERE created_by IS NULL;
UPDATE public.company_tasks SET created_by = 'bb045c54-9d36-48bf-adf2-e988284e7261' WHERE created_by IS NULL;

-- 5. Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'task_assigned',
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  reference_id text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Authenticated can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- 6. Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- Create profiles for existing users
INSERT INTO public.profiles (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
