export const translations = {
  en: {
    appTitle: 'Pocket Budget',
    appSubtitle: 'Shared trip budget tracker',

    // Auth
    yourName: 'Your name',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign In',
    createAccount: 'Create Account',
    noAccount: 'No account? Sign up',
    haveAccount: 'Already have an account? Sign in',

    // Group setup
    setupSubtitle: 'Set up your budget group',
    createGroupBtn: 'Create a new group',
    joinGroupBtn: 'Join with an invite code',
    createGroupAction: 'Create Group',
    joinGroupAction: 'Join Group',
    back: 'Back',
    createGroupDesc: "You'll become the admin and receive an invite code to share with your partner.",
    inviteCodePlaceholder: 'INVITE CODE',
    failedCreate: 'Failed to create group. Please try again.',
    failedJoin: 'Failed to join group. Please try again.',
    invalidCode: 'Invalid code. Ask your group admin for the correct invite code.',

    // Header
    hi: 'Hi',
    signOut: 'Sign out',
    todayBalance: "Today's balance",
    dailyBudget: 'Daily budget',
    weekly: 'weekly',
    spent: 'Spent Today',
    reassignTitle: (desc) => `Move "${desc}" to:`,
    reassignConfirm: (name) => `Move to ${name}`,
    reassignCancel: 'Cancel',
    rollover: 'Rollover',
    carriedOver: 'Carried over',
    availableToday: 'Available today',
    availableInfoTitle: 'How is this calculated?',
    availableInfoFromBalance: 'From today\'s balance',
    availableInfoBorrow: 'Borrowable from tomorrow',
    availableInfoTotal: 'Total available today',
    availableInfoNote: 'The large number shows your net position. "Available today" is how much more you can spend before hitting the daily limit.',
    overdraft: (amount) => `In overdraft — still available today: ${amount}`,

    // Tabs
    tabExpenses: 'Expenses',
    tabStats: 'Stats',
    tabMembers: 'Members',
    tabSettings: 'Settings',

    // Expenses
    noExpenses: 'No expenses yet — add your first one!',
    today: 'Today',
    yesterday: 'Yesterday',

    // Stats
    filterToday: 'Today',
    filter7Days: '7 Days',
    filterMonth: 'Month',
    filterAll: 'All',
    breakdownLabel: (amount) => `Breakdown · ${amount} total`,
    noDataPeriod: 'No data for this period',
    tapDrilldown: 'tap ›',

    // Members
    inviteCodeLabel: 'Invite Code',
    inviteCodeDesc: 'Share with your partner to join',
    copy: 'Copy',
    groupMembersLabel: 'Group Members',
    sharedSavingsBox: 'Shared Savings Box',
    totalLabel: 'Total',
    resetSharedSavings: 'Reset Shared Savings',
    balanceLabel: 'balance',
    adminLabel: 'admin',
    todayLabel: (amount) => `Today: ${amount}`,

    // Profile / avatar
    yourProfile: 'Your Profile',
    uploadAvatar: 'Upload Photo',
    changeAvatar: 'Change Photo',

    // Borrow settings
    borrowLabel: 'Borrow from tomorrow',
    borrowDesc: 'Let today\'s balance go below zero by borrowing from the next day\'s budget',
    borrowPercent: 'How much can you borrow?',
    borrowPercentDesc: (n) => `Up to ${n}% of the daily budget`,
    borrowSaved: 'Saved',

    // Settings
    yourSavingsBox: 'Your Savings Box',
    personalSavings: 'Personal Savings',
    personalSavingsDesc: 'Accumulated from weekly prompts',
    budgetSettingsLabel: 'Budget Settings',
    budgetSettingsDesc: 'Changes take effect from the next day',
    currencyLabel: 'Currency',
    currencyDesc: 'Applies to all members',
    budgetModeLabel: 'Budget Mode',
    budgetModeDesc: 'Daily or weekly input',
    modeDaily: 'Daily',
    modeWeekly: 'Weekly',
    dailyBudgetInput: 'Daily Budget',
    weeklyBudgetInput: 'Weekly Budget',
    dailyPreview: 'Daily',
    saveSettingsBtn: 'Save Settings',
    savedBtn: '✓ Saved!',

    // Add expense
    addExpenseTitle: 'Add Expense',
    productNamePlaceholder: 'Product name',
    amountPlaceholder: (c) => `Amount in ${c}`,
    cancelBtn: 'Cancel',
    addBtn: 'Add',
    maxSpendError: (currency, max) =>
      `Max daily spend is ${currency}${max}. You already used all of today's and tomorrow's budget. No more spending is possible for today bitch!`,

    // Sunday prompt
    sundayTitle: '🌟 Weekly Check-in',
    sundayDesc: (amount) => `You saved ${amount} this week! What would you like to do with it?`,
    keepCarrying: 'Keep it in my balance',
    moveToPersonal: 'Move to personal savings',
    moveToShared: 'Move to shared savings',
    remindLater: 'Remind me later',
    confirmBtn: 'Confirm',
    sundayDeficitTitle: '📋 Weekly Summary',
    sundayDeficitDesc: (amount) => `You're carrying ${amount} debt into next week. It will be deducted from your upcoming budget.`,
    gotIt: 'Got it',

    // Categories
    cat_food: 'Food & Drinks',
    cat_groceries: 'Groceries',
    cat_transport: 'Transport',
    cat_activities: 'Activities',
    cat_shopping: 'Shopping',
    cat_accommodation: 'Accommodation',
    cat_beauty: 'Beauty',
    cat_other: 'Other',

    // View mode
    viewMe: 'Just me',
    viewAll: 'Everyone',

    // Products tab
    tabProducts: 'Products',
    addProductBtn: '+ Add Product',
    noProducts: 'No products yet — add your first one!',
    addProductTitle: 'Add Product',
    deleteProduct: 'Delete',
    expenseDate: 'Date',
    addPhoto: 'Add Photo',
    changePhoto: 'Change Photo',

    // Shopping list tab
    tabShopping: 'Quick List',
    addShoppingItem: 'Add item...',
    noShoppingItems: 'Your list is empty',
    clearCompleted: 'Clear completed',
    boughtModalTitle: 'I bought it!',
    addAsExpense: 'Add as expense',
    justDelete: 'Just delete',

    // Country setting
    countryLabel: 'Country',
    countryDesc: 'Used for local price estimations',
    countryDE: 'Germany', countryIL: 'Israel', countryFR: 'France',
    countryES: 'Spain',   countryGB: 'United Kingdom', countryUS: 'United States',

    // Cart estimation
    cartEstimationBtn: 'Cart Estimation',
    estimating: 'Estimating…',
    estimatedTotal: (amount) => `Estimated total: ~${amount}`,
    estimationSummary: (priced, total) => `${priced} of ${total} items priced`,
    estimationUnrecognized: (n) => `${n} unrecognized`,

    // Claim feature
    onMyWayBadge: 'is on the way',
    claimBtn: 'On my way!',
    unclaimBtn: 'Cancel claim',
    alreadyClaimed: 'Already claimed by someone',

    // All / Mine filter
    filterMine: 'Mine',

    // Named Lists
    myLists: 'My Lists',
    createList: 'Create list',
    listNamePlaceholder: 'List name',
    listEmojiPlaceholder: 'Emoji (optional)',
    sharedList: 'Shared',
    privateList: 'Private',
    noLists: 'No lists yet — create one!',
    noListItems: 'Empty — add the first item',
    addListItem: 'Add item...',
  },

  he: {
    appTitle: 'Pocket Budget',
    appSubtitle: 'מעקב תקציב משותף לטיול',

    // Auth
    yourName: 'השם שלך',
    email: 'אימייל',
    password: 'סיסמה',
    signIn: 'כניסה',
    createAccount: 'יצירת חשבון',
    noAccount: 'אין חשבון? הירשם',
    haveAccount: 'יש חשבון? התחבר',

    // Group setup
    setupSubtitle: 'הגדרת קבוצת תקציב',
    createGroupBtn: 'יצירת קבוצה חדשה',
    joinGroupBtn: 'הצטרפות עם קוד הזמנה',
    createGroupAction: 'יצירת קבוצה',
    joinGroupAction: 'הצטרפות',
    back: 'חזרה',
    createGroupDesc: 'תהיה מנהל הקבוצה ותקבל קוד הזמנה לשלוח לפרטנר שלך.',
    inviteCodePlaceholder: 'קוד הזמנה',
    failedCreate: 'יצירת הקבוצה נכשלה. נסה שוב.',
    failedJoin: 'ההצטרפות נכשלה. נסה שוב.',
    invalidCode: 'קוד לא תקין. בקש מהמנהל את הקוד הנכון.',

    // Header
    hi: 'היי',
    signOut: 'התנתקות',
    todayBalance: 'יתרה היום',
    dailyBudget: 'תקציב יומי',
    weekly: 'שבועי',
    spent: 'הוצאות היום',
    rollover: 'צבירה',
    carriedOver: 'חיסכון ימים קודמים',
    availableToday: 'זמין היום',
    availableInfoTitle: 'איך זה מחושב?',
    availableInfoFromBalance: 'מהיתרה של היום',
    availableInfoBorrow: 'ניתן להשאיל ממחר',
    availableInfoTotal: 'סך הכל זמין היום',
    availableInfoNote: 'המספר הגדול מציג את המצב הנכסי שלך. "זמין היום" מראה כמה עוד ניתן להוציא לפני שמגיעים למגבלה היומית.',
    reassignTitle: (desc) => `העבר את "${desc}" אל:`,
    reassignConfirm: (name) => `העבר אל ${name}`,
    reassignCancel: 'ביטול',
    overdraft: (amount) => `חריגה — עוד ניתן היום: ${amount}`,

    // Tabs
    tabExpenses: 'הוצאות',
    tabStats: 'סטטיסטיקה',
    tabMembers: 'חברים',
    tabSettings: 'הגדרות',

    // Expenses
    noExpenses: 'אין הוצאות עדיין — הוסף את הראשונה!',
    today: 'היום',
    yesterday: 'אתמול',

    // Stats
    filterToday: 'היום',
    filter7Days: '7 ימים',
    filterMonth: 'חודש',
    filterAll: 'הכל',
    breakdownLabel: (amount) => `פירוט · סה"כ ${amount}`,
    noDataPeriod: 'אין נתונים לתקופה זו',
    tapDrilldown: '‹ לחץ',

    // Members
    inviteCodeLabel: 'קוד הזמנה',
    inviteCodeDesc: 'שתף עם הפרטנר שלך',
    copy: 'העתק',
    groupMembersLabel: 'חברי הקבוצה',
    sharedSavingsBox: 'קופת חיסכון משותפת',
    totalLabel: 'סה"כ',
    resetSharedSavings: 'איפוס חיסכון משותף',
    balanceLabel: 'יתרה',
    adminLabel: 'מנהל',
    todayLabel: (amount) => `היום: ${amount}`,

    // Profile / avatar
    yourProfile: 'הפרופיל שלך',
    uploadAvatar: 'העלאת תמונה',
    changeAvatar: 'שינוי תמונה',

    // Borrow settings
    borrowLabel: 'השאלה ממחר',
    borrowDesc: 'אפשר ליתרה של היום לרדת מתחת לאפס על ידי השאלה מתקציב הימים הבאים',
    borrowPercent: 'כמה ניתן להשאיל?',
    borrowPercentDesc: (n) => `עד ${n}% מהתקציב היומי`,
    borrowSaved: 'נשמר',

    // Settings
    yourSavingsBox: 'קופת החיסכון שלך',
    personalSavings: 'חיסכון אישי',
    personalSavingsDesc: 'נצבר מבחירות שבועיות',
    budgetSettingsLabel: 'הגדרות תקציב',
    budgetSettingsDesc: 'השינויים ייכנסו לתוקף מהיום הבא',
    currencyLabel: 'מטבע',
    currencyDesc: 'חל על כל החברים',
    budgetModeLabel: 'מצב תקציב',
    budgetModeDesc: 'קלט יומי או שבועי',
    modeDaily: 'יומי',
    modeWeekly: 'שבועי',
    dailyBudgetInput: 'תקציב יומי',
    weeklyBudgetInput: 'תקציב שבועי',
    dailyPreview: 'יומי',
    saveSettingsBtn: 'שמירת הגדרות',
    savedBtn: '✓ נשמר!',

    // Add expense
    addExpenseTitle: 'הוספת הוצאה',
    productNamePlaceholder: 'שם המוצר',
    amountPlaceholder: (c) => `סכום ב${c}`,
    cancelBtn: 'ביטול',
    addBtn: 'הוספה',
    maxSpendError: (currency, max) =>
      `המקסימום היומי הוא ${currency}${max}. השתמשת בכל תקציב היום ומחר. לא ניתן להוסיף יותר להיום!`,

    // Sunday prompt
    sundayTitle: '🌟 בדיקה שבועית',
    sundayDesc: (amount) => `חסכת ${amount} השבוע! מה תרצה לעשות עם זה?`,
    keepCarrying: 'השאר ביתרה שלי',
    moveToPersonal: 'העבר לחיסכון האישי',
    moveToShared: 'העבר לחיסכון המשותף',
    remindLater: 'הזכר לי מאוחר יותר',
    confirmBtn: 'אישור',
    sundayDeficitTitle: '📋 סיכום שבועי',
    sundayDeficitDesc: (amount) => `אתה נכנס לשבוע הבא עם חוב של ${amount}. הוא יקוזז מהתקציב הקרוב שלך.`,
    gotIt: 'הבנתי',

    // Categories
    cat_food: 'אוכל ושתייה',
    cat_groceries: 'מכולת',
    cat_transport: 'תחבורה',
    cat_activities: 'פעילויות',
    cat_shopping: 'קניות',
    cat_accommodation: 'לינה',
    cat_beauty: 'יופי',
    cat_other: 'אחר',

    // View mode
    viewMe: 'רק אני',
    viewAll: 'כולם',

    // Products tab
    tabProducts: 'מוצרים',
    addProductBtn: '+ הוסף מוצר',
    noProducts: 'אין מוצרים עדיין — הוסף את הראשון!',
    addProductTitle: 'הוספת מוצר',
    deleteProduct: 'מחיקה',
    expenseDate: 'תאריך',
    addPhoto: 'הוסף תמונה',
    changePhoto: 'שנה תמונה',

    // Shopping list tab
    tabShopping: 'רשימה מהירה',
    addShoppingItem: 'הוסף פריט...',
    noShoppingItems: 'הרשימה ריקה',
    clearCompleted: 'נקה מסומנים',
    boughtModalTitle: 'קניתי!',
    addAsExpense: 'הוסף כהוצאה',
    justDelete: 'מחק בלבד',

    // Country setting
    countryLabel: 'מדינה',
    countryDesc: 'משמש להערכות מחיר מקומיות',
    countryDE: 'גרמניה', countryIL: 'ישראל', countryFR: 'צרפת',
    countryES: 'ספרד',   countryGB: 'בריטניה', countryUS: 'ארצות הברית',

    // Cart estimation
    cartEstimationBtn: 'הערכת עגלה',
    estimating: 'מעריך…',
    estimatedTotal: (amount) => `סה"כ משוער: ~${amount}`,
    estimationSummary: (priced, total) => `${priced} מתוך ${total} פריטים מתומחרים`,
    estimationUnrecognized: (n) => `${n} לא מזוהים`,

    // Claim feature
    onMyWayBadge: 'בדרך',
    claimBtn: 'אני בדרך!',
    unclaimBtn: 'בטל תביעה',
    alreadyClaimed: 'כבר נלקח על ידי מישהו',

    // All / Mine filter
    filterMine: 'שלי',

    // Named Lists
    myLists: 'הרשימות שלי',
    createList: 'צור רשימה',
    listNamePlaceholder: 'שם הרשימה',
    listEmojiPlaceholder: 'אמוג\'י (אופציונלי)',
    sharedList: 'משותף',
    privateList: 'פרטי',
    noLists: 'אין רשימות עדיין — צור אחת!',
    noListItems: 'ריק — הוסף את הפריט הראשון',
    addListItem: 'הוסף פריט...',
  },
};
