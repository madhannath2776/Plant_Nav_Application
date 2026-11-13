export type Plant = {
  id: string;
  name: string;
  image_url?: string | null;
  landmark?: string | null;
  latitude: number;
  longitude: number;
  created_at?: string;
};

export type UserProfile = {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
  xp?: number | null;
  level?: number | null;
  streak?: number | null;
  verified_count?: number | null;
};

export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

export type PlantWithDistance = Plant & { distance?: number };

export type SubmissionStatus = "pending" | "approved" | "rejected";

export type Submission = {
  id: string;
  plant_name: string;
  status: SubmissionStatus;
  created_at: string;
  image_url?: string | null;
  landmark?: string | null;
  xp_awarded?: number | null;
  level_before?: number | null;
  level_after?: number | null;
  achievements_unlocked?: string[] | null;
  reward_seen?: boolean | null;
};

export type AdminSubmission = {
  id: string;
  user_id: string;
  submitted_by: string;
  plant_name: string;
  image_url: string | null;
  latitude: number;
  longitude: number;
  location_source: string | null;
  gps_accuracy: number | null;
  landmark: string | null;
  status: SubmissionStatus;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type LeaderboardRow = UserProfile & { rank: number; verified_count: number };
