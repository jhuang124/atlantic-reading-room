import archiveCatalog from './archive-catalog.json' with { type: 'json' };

export type ContentsEntry = {
  title: string;
  author?: string;
  printedPage: number;
  section: string;
  sourceContentsPage?: number;
  pdfLinkPage?: number | null;
  visualCheckPage?: number;
};
export type ReadableIssue = {
  id: string;
  issue: string;
  pageCount: number;
  printOffset?: number;
  backMatterPages?: number;
  indexEncoding?: string;
  contentsPage: number;
  coverStoryPage: number;
  contents: ContentsEntry[];
};
const item = (
  title: string,
  author: string,
  printedPage: number,
  section = 'Features',
): ContentsEntry => ({ title, author, printedPage, section });
export const readerIssues: ReadableIssue[] = [
  {
    id: '202609',
    indexEncoding: 'gzip',
    issue: 'September 2026',
    pageCount: 112,
    contentsPage: 7,
    coverStoryPage: 70,
    contents: [
      item('The Commons', 'Discussion & Debate', 8, 'Front'),
      item('The Blue Book Is Back', 'Walt Hunter', 11, 'Dispatches'),
      item('You Call That a Pull-Up?', 'Tom Bartlett', 14, 'Dispatches'),
      item('Kevin Dowdell’s Boys', 'Sally Jenkins', 16),
      item('Did al-Qaeda Succeed?', 'Graeme Wood', 26),
      item('How Do Monarchs Do It?', 'Vann R. Newkirk II', 36),
      item('The Cities That Said Yes to Drugs', 'Michael Powell', 48),
      item('The Great Romance Slump', 'Faith Hill', 58),
      item(
        'Confessions of a Token Black Professor',
        'Tyler Austin Harper',
        68,
        'Cover story',
      ),
      item('Not Quite the Vineyard', 'James Parker', 82, 'Culture & Critics'),
      item(
        'What if Freud Was Right?',
        'Scott Stossel',
        84,
        'Culture & Critics',
      ),
      item(
        'Bad Luck, Bad Choices',
        'Mark Oppenheimer',
        89,
        'Culture & Critics',
      ),
      item(
        'A Book That Wasn’t Meant to Be Read',
        'Matthew Walther',
        92,
        'Culture & Critics',
      ),
      item('Invisible Men', 'Stephanie Burt', 96, 'Culture & Critics'),
      item('Stance', 'Deborah Garrison', 99, 'Poetry'),
      item('Music’s Most Mysterious Profession', 'Matthew Aucoin', 100, 'Back'),
      item('Look Closer', 'Susan Tallman', 108, 'Back'),
    ],
  },
  {
    id: '202608',
    indexEncoding: 'gzip',
    issue: 'August 2026',
    pageCount: 104,
    contentsPage: 5,
    coverStoryPage: 14,
    contents: [
      item('The Commons', 'Discussion & Debate', 6, 'Front'),
      item('The “Consumer Socialism” Trap', 'Idrees Kahloon', 9, 'Dispatches'),
      item('The Age of Reading Is Over', 'Rose Horowitch', 12, 'Cover story'),
      item('The Rosenberg Boys', 'Amy Weiss-Meyer', 26),
      item('What AI Will Do to Art', 'Spencer Kornhaber', 40),
      item('The Demons of Maryville', 'Stephanie McCrummen', 52),
      item('The Cicerone', 'Cullen Murphy', 62),
      item('Full Stop', 'Judith Shulevitz', 72, 'Culture & Critics'),
      item('From Idaho B Roll', 'Brian Blanchfield', 74, 'Poetry'),
      item('Tennis’s New Golden Age', 'Josh Levin', 76, 'Culture & Critics'),
      item(
        'The Slave Ship and the Mayflower',
        'James Traub',
        80,
        'Culture & Critics',
      ),
      item('The Scrubbed and Simple Moon', 'Carol Frost', 83, 'Poetry'),
      item(
        'The Mischievous, Maddening Marcel Duchamp',
        'Sebastian Smee',
        84,
        'Culture & Critics',
      ),
      item('Paradise Revisited', 'Helen Lewis', 88, 'Back'),
      item('Look Closer', 'Susan Tallman', 100, 'Back'),
    ],
  },
  {
    id: '202512',
    indexEncoding: 'gzip',
    issue: 'December 2025',
    pageCount: 108,
    contentsPage: 7,
    coverStoryPage: 22,
    contents: [
      item('The Commons', 'Discussion & Debate', 8, 'Front'),
      item('Get a Real Friend', 'Damon Beres', 11, 'Dispatches'),
      item('Wheels Up', 'Edward Burtynsky', 16, 'Dispatches'),
      item('The Coming Election Mayhem', 'David A. Graham', 20, 'Cover story'),
      item('President for Life', 'J. Michael Luttig', 30),
      item('The Missing Kayaker', 'Jamie Thompson', 34),
      item('The Dead Zones', 'Vann R. Newkirk II', 54),
      item('Why I Run', 'Nicholas Thompson', 66),
      item('The Last of the Literary Outdoorsmen', 'Tyler Austin Harper', 74),
      item('The One and Only Sammy', 'Questlove', 82, 'Culture & Critics'),
      item(
        'The Man Who Rescued Faulkner',
        'Michael Gorra',
        86,
        'Culture & Critics',
      ),
      item('Coyote', 'Carol Muske-Dukes', 89, 'Poetry'),
      item(
        'The Realist Magic of Philip Pullman',
        'Lev Grossman',
        90,
        'Culture & Critics',
      ),
      item(
        'Patti Smith’s Lifetime of Reinvention',
        'Amy Weiss-Meyer',
        94,
        'Culture & Critics',
      ),
      item('We Are Not One', 'George Packer', 98, 'Fiction'),
      item('Caleb’s Inferno', 'Caleb Madison', 104, 'Back'),
    ],
  },
  ...archiveCatalog,
];
