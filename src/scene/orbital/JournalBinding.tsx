import { StudyBook } from './book-study/StudyBook';
import { useJournalBook } from './JournalBookState';

export const JOURNAL_MODEL_SCALE = 0.226;

export function JournalBinding({ opened }: { opened: boolean; color: string }) {
  const book = useJournalBook();
  return <group scale={JOURNAL_MODEL_SCALE}><StudyBook opened={opened} control={book} /></group>;
}
