import { Report, Squad, Citizen, Reward, Badge, Transformation } from './types';

export const initialReports: Report[] = [
  {
    id: 'rep-1',
    reporter: {
      name: 'Sarah J.',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDF9M8zpwiPkN0UOzmtWIdRBOz2wOAyjkZuyRK8BaGHmwcXDw4S7EeYwazCOGFIEtcnsnLjw8yILAcp26COc0h8BGcDy5iCfK8xOnPoQaAHoyl-I6XnKDVdr5ODBtrsZnqGG0j2vO1Kr_ZnJ2Opb2MUT0ekRqwmVSVDKNnl8qTx2bHmuvkBrtYbUvrMJdpAXvDwEttUBuq1HRkL_IDZ6ALWDXT4Cgk7R65_mFEWwo_F4uJySxLdZneRoew40liiqdYFrGRohoNh9HE'
    },
    timeAgo: '2 mins ago',
    district: 'Downtown',
    urgency: 'High',
    category: 'Vision AI: Pothole',
    matchPercentage: 98,
    title: 'Large Pothole on Main St.',
    description: 'Significant damage to the right lane causing traffic slowdowns. Needs immediate attention before rush hour.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuANUInoxPD65_hoNIvj7p8Xgrq-xNlw7timAYxPgVo4VH2kpRsG66Vm8Xy4ObhzQkzgoCY35eD5lJiW8Lz4BTLZRvOqNQqu1cTLIrKCArF0stbB0qLZceM6I6L-2biKGR0tdgXesrp9SX5Ipjrwc3IbHoUcZvnU3OFwpUtnpBXlo1QKP9SFgEAmiQPwg8J_gdoIW42rfp_YjmRSL3Cr4GQL8qEQ9p8D_E2zEuepljg7x3s4PeldJHmDgqLxvx_xKEdLidxZvSgDd1M',
    locationDetails: 'Main St & 4th Ave',
    upvotes: 24,
    comments: 5,
    verified: false,
    coordinates: { top: '55%', left: '35%' },
    icon: 'warning'
  },
  {
    id: 'rep-2',
    reporter: {
      name: 'Anonymous',
      avatar: ''
    },
    timeAgo: '15 mins ago',
    district: 'Riverside Park',
    urgency: 'Medium',
    category: 'Vision AI: Graffiti',
    matchPercentage: 85,
    title: 'Graffiti on Park Bench',
    description: 'New tags appeared on the benches near the east entrance overnight.',
    upvotes: 8,
    comments: 0,
    verified: false,
    coordinates: { top: '45%', left: '65%' },
    icon: 'potted_plant'
  },
  {
    id: 'rep-3',
    reporter: {
      name: 'Marcus T.',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAw7rLjV1AU38mtiFBb0fFEEY0Qb-ApOEtCJGJ3Y53_9yTarJ254uG5DwS_XAKt2jfj23PQqhQ76yCzwz8CpX6YHnfoQsNU-L0sJ3UvB2JxCL-LtqwSlAWc89OniLPElzbh2DFQy3qqNsXvdEpEb9HM22qNkvaF0wwNrBLk69gWkCfrcQiQbl8CuWLAg-RtZ4CXrJhKgr7QG1Kx0CaLJfT3EpjRwGDt7IAvpNCf0fYflkq6p0rzkocZk9yJVKPtYfKooAdwW3MBsFw'
    },
    timeAgo: '1 hr ago',
    district: 'Westside',
    urgency: 'Low',
    category: 'AI: Maintenance Request',
    title: 'Broken Streetlight',
    description: 'The light pole outside the community center is flickering constantly.',
    upvotes: 2,
    comments: 1,
    verified: false,
    coordinates: { top: '25%', left: '20%' },
    icon: 'lightbulb'
  }
];

export const initialSquads: Squad[] = [
  {
    id: 'sqd-1',
    name: 'Riverside Cleanup',
    description: 'Clearing debris and planting native species along the east river bank.',
    category: 'park',
    icon: 'park',
    distance: '3 miles away',
    volunteersCount: 12,
    volunteersMax: 20
  },
  {
    id: 'sqd-2',
    name: 'Tech Mentors',
    description: 'Teaching basic coding skills to middle schoolers at the local library.',
    category: 'school',
    icon: 'school',
    distance: '1.5 miles away',
    volunteersCount: 8,
    volunteersMax: 10
  }
];

export const initialLeaderboard: Citizen[] = [
  {
    rank: 1,
    name: 'David K.',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDMlPMWWvpNhlbfg3sSsILfHFVXLCrxidBetLSZHIX-2TKX92JUc_THWoUqqR_WaN_kAJkdnKtW08s3ePRi_vdOUislO4_qNmDHsYreGbgkOE5qMov6th5Qzq3OOzuc2gmgJhC0QVEnMvUelA8glxOcpae7vI8ez0XK-uXnKTr7_e9yISpYibUnz2KmIcLk2G0WzRvqFpZ9nUvIDZaN_IMfFiz7pfGcNz0Ka_zqr446S2ocOBMLqSbH8JgknNunWg2A72CoyWQ7HjM',
    points: 4200
  },
  {
    rank: 2,
    name: 'Sarah J. (You)',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC_lAp8z4bNL3A35euAejA4P4Jp-c_46htfSECdf0e2OahOosB1nASedDS7AIskfRGj8SYzUcydfuRT1Dr-yu_Z6VzuOt-Ap9rRQlNzdZFKv3IFZsybhe-_4NlOtyv2BuNBboqAJXJv3wN303mFXyl2riZr3fcJqKxzh7KQS8Tl-fQqhGGkUTyQiAdH8irxUlSS1h1f-HR-2mRxm444aOQ_R7wtX5Ta9G21tUMSZL9yOkGchSPsR8azAFc7YANDl4LgauEhxgUYX9A',
    points: 3850,
    isCurrentUser: true
  },
  {
    rank: 3,
    name: 'Elena M.',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBv6STNA26nInNarkvXxjoguVXBjs9wgqwMijuX9NCs3ZYHBeSXcpeDURBDCNbnIFmEsvemro7JrasAN6vfd29mjxLcNCmqruOon1ezvI0Nby-fPzNE1sXlw1o959SHVY9sUwskyoNXHXS3pnZrqucB6Y07QedgUqC86k80HUhrNNfvjW-qQAFRwsyH1VN0R6rHsbySqOI1F5ugTJJeIoPiyfxH-Kwuum-vqfHbDvRb7OjUhhebew_jxYyQ74O2mDd8pH2vN_5hoWw',
    points: 3100
  }
];

export const initialRewards: Reward[] = [
  {
    id: 'rew-1',
    title: 'Local Roasters Voucher',
    description: 'Enjoy a free coffee and pastry at any participating neighborhood cafe.',
    cost: 1200,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBeTY54zbfXT2P7S0u99ujpPtf8jJNLzrJgcN4RhhekYPxoplhO-zxNTMVQdaWtOfbPfEK4EzFqEW8Jo9AEEn0TeIgidicgExGgamitLSWAZgilyyr9J8RGl70J3GTKNIqjElOvBJK7ytDih28XFNRXh03tdPXh1w2NQlq4uk0gkdxwhsvNGCDDvDjiAV20dFZ1VB9oVXso_BHPu829fUk_w3TqMavK0xNRtk3UhoInywrU3AGRTT0RSAOeD3ZX1akL2mFaT76jDlg'
  },
  {
    id: 'rew-2',
    title: 'Urban Garden Toolkit',
    description: 'Premium tools and seasonal seeds for your local community garden plot.',
    cost: 3500,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAF7vNBEg3XV1Nsggk9Oy1I97kf997ueLvGyHgQ2t58hKWq0RMtLpUv-R07A0-GfRv1XOhUgs7q1T8So1xx2Pdi4aEcQLoC--k5-ti0iAjLp01CrLoICFJx5ZtW5zJ8VZxmDbgSNojciCIteAOeZpIff1A_ZF-nCW7vswD81-qPuHAoD72VqjR07omI8JdSud6de6HguQ-rV3LB40qHbDbengAEjG5oAPJYF1110___S-i9IYVaoBToLzWi1hUrPt1-1-iLzAxEHiU'
  },
  {
    id: 'rew-3',
    title: 'Monthly Transit Pass',
    description: 'Unlimited rides on all city buses and light rail networks for 30 days.',
    cost: 5000,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCqbDe-UlaafwWJwYcG2Fmmm_jAIFBYxnqRV2jwxb42tLxz3GLUXuKvvcmNyal5VROI3AHvHaIC0vpEw1u5HEiJ0a7pI4I56u12j8zQO7nVBLIzSclMs8j6haZJQteT8qFcMNlnOooLdHicNzePrjf1UEp_pPsmTmk5zIb0FWxqqHBPJHDy4JnRIcV8pJf61p_f3yES4YnqRxhA2NyzQL5wBPPJSYVCXAaEO0nOfAJlba6Kjdkg0OmBYROVwbjHsOTM-eDwP3TvtA4'
  }
];

export const initialBadges: Badge[] = [
  {
    id: 'bdg-1',
    name: 'Eco Warrior',
    icon: 'eco',
    gradient: 'from-tertiary-fixed to-tertiary-container',
    unlocked: true
  },
  {
    id: 'bdg-2',
    name: 'Pavement Pioneer',
    icon: 'pedal_bike',
    gradient: 'from-secondary-fixed to-secondary',
    unlocked: true
  },
  {
    id: 'bdg-3',
    name: 'Master Planter',
    icon: 'park',
    gradient: 'from-primary-fixed to-primary',
    unlocked: false,
    cost: 800
  },
  {
    id: 'bdg-4',
    name: 'Helper Heart',
    icon: 'volunteer_activism',
    gradient: 'from-error-container to-error',
    unlocked: false,
    cost: 400
  }
];

export const initialTransformations: Transformation[] = [
  {
    id: 'trf-1',
    title: 'Sunnydale Park Revival',
    category: 'Park Cleanup',
    description: 'A community effort cleared 50 bags of debris and planted new native flora, restoring the park\'s vibrant energy.',
    beforeImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBWg4qilF0NOAP66LLBier1AeQDuN6h5gWjEbcz1Vd7FzIoGlVThB7VAsb-Q_MaNRbJjo_I7R9ChLNWsnZS2dF_KkVtLC5fRZNOLKs6ksAgxsbIXeka5aGKaW5DzGyd14WRqDxYZ6RdPJ6Y3Ky4IcMhdrZHEt9yaPfV076tiZtMHGpHwJWLmr3l9U_pPgn3MdbJpZQMZIx-Y8idAjlUuj12D8sOjVc3Lpv6XjtJyRfBJHxZKwIThlG_JtLX_i2DWANjZ4Abdm0AkUg',
    afterImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCcKejaU4VOzFaKm7gPPYHeYvifWmxh3gjCtP2WOnxT7kxwoZaCPHuFfBA8-dWUY8Gg-bpomCh2ueLBzR8hdpzZi2bQn7KQ6fpTrU9iCUGzCbTr_5NpTihTFwcmrmtcx9w6JXwXcwnOY-7yOmGVECj08hPnbxJGCh57G4sL2uml-AOd1M3P9u20NSp97ITxoJfMejXNfWqT7JK9asHGdCk4MR_BAXXkWaMjrS37t1COUOEUrNdQkYws999I-MIB7z8A8WB2bDXOj98',
    heroesCount: 15,
    heroesAvatars: [
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBF83e5QeFxleRDI634mPkj-unB2qDKMWMHcZ52JXxq0nUa0AhtXmtEuLdP9IGssk4x4f7bDtksppwD0yJRHBqwf2pNmWI_QNSagtkIpaIdJq_fkR-_N_bVhdNoVyM1VFY9oSxhg-kr7mR6JFC7SU6f1VvxaLrlD2dym5XXNxUzTVXfV8kpvIf0r0IMc8WI5X6NrOkyUsBbJQ4SNEw0XEY7pc7_0bUE78-xr-R4FAO9bDKvseTiHyjERn6f_T5mld2yjPQPFBYz_Mk',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBpsZtP15znShiaK4xjqvQDHWdH_RqzgGKzw3QYcK-LS44oBBrAPT4tc8eLhiv0AnRRzKLZFOio-GdDyA1pDaB0Bqs1e2MsoNoM7mFXSAYdJcaL_9aSN7H_JP0L8vb_fLBnTORS1V7WFyop-S1n7omPfGW5MtpRGNkDEaLvX4a3fFTvmfuj44PMKUUlolbCEK0Yt1RSOTGRcd602yCzM63eeXteWYWma7lhOnwnf3ycD0X18esNtAMynyHcKrBkOVxRGotdomWHK5I',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAgRSrFoVPw0dbaS0hvArpvqf3HS8-roeTNNgPYRLk9-ek4LE1-q8bpLy8IlY0PQHuoilsgancwr4m_WPxxd2Tjexgy9waoaZVE83pVsXHafu6qR5pDIQVHdu3cLaG9xUoYZgzCITZkCS4PQWZ7kSQQc3MaZ0lZ06UGVo28lE0PTm_iw49qILkvF_4Va3jzP8Gxa1RlGW9d0f5TwjsdTMRA8Rkwnu5bBOxlhCIZGM9S4ZAVxgRDehbzP1ZwHPqnHFl-dfwKYzCE2jM'
    ]
  },
  {
    id: 'trf-2',
    title: 'Maple St. Illumination',
    category: 'Infrastructure',
    description: 'Reported 3 weeks ago, the city finally replaced the broken fixtures, making the evening commute safe again.',
    beforeImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCJAehDptL3twsNeWn9e9PZRk-KXUY9SRIV9xBdQPbp6eQeigxCtuNT0M5O-rAibPPjoLD3ZHl3gNdznxFdWdH4NSo4DsZ6Tsv9KGD4a66fygJwmJz2RNsypJgOsIgvN7IoM8xabDEnKrwgesRYGzxqDJ22vpzliSDY634ghmPYPHuOSfw1PuAge7w6GvwtwV1emIQumY20rGEXIVCkgknUd41oHcFMOZ3f51XuN2pvyRGEU7d6KiMgDPpNi9hAQhFRXGKlpxVQzrI',
    afterImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAg1sSlckVHPovlQnkHx0X083HZAhOlYjWVT6cCEcE4q4g3QfMyW5DBNEJHW8Rd7buqoyx1EP0JqX1UTBElOSFYJIH-Swnmx8gIVCl0bd0hWwLpbAvX1XE7uKoxCbthzziR1Vrq-NI7ILfXjZMTe4j2rTDmrdrLRz3E2PUfbk3X5sR_Ql95wZav5EyV4hB9LOU6-xZ7qfhnpAKJZK6HkPrIGlEDYlf9eia9I4mhMlXCux2nMveulu5Y07h1030e7mydVHKukESGVDE',
    heroesCount: 1,
    reportedBy: 'Reported by Sarah J.',
    heroesAvatars: [
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBsCEkTkYvDKyC_0xMrPQ8dhSn9bmjXn1rY-BbYKxhu82cnd73uIZtB7pJLESH_6b_0UhWYpxGAiDN2TvdnPSCqdwinO06HneFivkaPSi-HWB0uAjZATLBrgkGXwWbEQrwcZwxtsyEL1yCtEHXFpH3Qmi3ApCHgOA_fsQUEJdYoiHoXFUrPp8FJ059t7qYI8XutRObmYcxEzF0H_Yqkl1Ux38YFsSVZnLcZpcb_Pl7hdNQ_m1OfSJoH95Cj5VoYqrwo-sBjjdrAVtg'
    ]
  }
];
