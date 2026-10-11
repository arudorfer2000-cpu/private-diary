export type Screen = 'calendar' | 'review' | 'trash' | 'search' | 'settings' | 'insights';

export type Entry = {
  mood: number; // 1-5
  title: string;
  text: string;
  tags: string[]; // kept inside the encrypted entry, so they stay private
  /** Ids of attached photos (the photos themselves are sealed separately). Missing means none. */
  photos?: string[];
  /** Optional place: coordinates only, rounded to about 100 m. */
  place?: Place;
};

export type Place = { lat: number; lon: number };

export type Entries = Record<number, Entry>; // key = day of month of the month being viewed
