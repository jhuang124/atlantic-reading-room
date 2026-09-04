export const articleEditions = [
  {
    id: 'blue-book',
    issueId: '202609',
    title: 'The Blue Book Is Back',
    author: 'Walt Hunter',
    pages: [13, 14, 15],
  },
  {
    id: 'look-closer-september',
    issueId: '202609',
    title: 'Contrejour in the French Style',
    author: 'Susan Tallman',
    pages: [110],
  },
  {
    id: 'look-closer-august',
    issueId: '202608',
    title: 'Interior With Women Beside a Linen Cupboard',
    author: 'Susan Tallman',
    pages: [102],
  },
];
export type ArticleEdition = (typeof articleEditions)[number] & {
  sections: { page: number; paragraphs: string[] }[];
};
