// English plus six widely used languages and Persian. Source identifiers stay unchanged.
import qualityMessages from './quality-strings.js';
import helpMessages from './help-strings.js';
import controlMessages from './control-strings.js';
import {applyTooltips} from './tooltips.js';
export const locales=['en','es','fr','de','zh','ja','ar','fa'];
let locale='en';
// Entries: Spanish, French, German, Chinese, Japanese, Arabic, Persian.
const messages={
  ...helpMessages,
  ...controlMessages,
  'pause motion':['pausar movimiento','mettre en pause','Bewegung pausieren','暂停动画','アニメーション停止','إيقاف الحركة','توقف حرکت'],
  'Simple':['Simple','Simple','Einfach','简洁','シンプル','بسيط','ساده'],
  'Advanced':['Avanzado','Avancé','Erweitert','高级','詳細','متقدم','پیشرفته'],
  'Interface mode':['Modo de interfaz','Mode de l’interface','Oberflächenmodus','界面模式','表示モード','وضع الواجهة','حالت رابط'],
  'Simple mode: essential controls.':['Modo simple: controles esenciales.','Mode simple : commandes essentielles.','Einfacher Modus: grundlegende Steuerung.','简洁模式：基本控件。','シンプルモード：基本操作。','الوضع البسيط: أدوات أساسية.','حالت ساده: کنترل‌های ضروری.'],
  'Advanced mode: all controls.':['Modo avanzado: todos los controles.','Mode avancé : toutes les commandes.','Erweiterter Modus: alle Steuerungen.','高级模式：全部控件。','詳細モード：すべての操作。','الوضع المتقدم: كل الأدوات.','حالت پیشرفته: همهٔ کنترل‌ها.'],
  'Find a building, then select it to explore its source.':['Busca un edificio y selecciónalo para explorar su código.','Trouvez un bâtiment, puis sélectionnez-le pour explorer son code.','Gebäude suchen und auswählen, um den Quellcode zu erkunden.','查找并选择建筑以探索其源码。','建物を探して選択し、ソースを確認します。','ابحث عن مبنى ثم اختره لاستكشاف مصدره.','ساختمانی را پیدا و انتخاب کنید تا کد آن را بررسی کنید.'],
  'Choose a folder to explore its code.':['Elige una carpeta para explorar su código.','Choisissez un dossier pour explorer son code.','Ordner auswählen, um seinen Code zu erkunden.','选择文件夹以探索代码。','フォルダーを選んでコードを確認します。','اختر مجلداً لاستكشاف شيفرته.','پوشه‌ای را برای بررسی کد آن انتخاب کنید.'],
  ...qualityMessages,
  'method':['método','méthode','Methode','方法','メソッド','أسلوب','متد'],
  'attribute':['atributo','attribut','Attribut','属性','属性','خاصية','ویژگی'],
  'building list (accessibility)':['lista de edificios (accesibilidad)','liste des bâtiments (accessibilité)','Gebäudeliste (Barrierefreiheit)','建筑列表（无障碍）','建物一覧（アクセシビリティ）','قائمة المباني (إمكانية الوصول)','فهرست ساختمان‌ها (دسترس‌پذیری)'],
  'toggle building list':['mostrar lista de edificios','afficher la liste des bâtiments','Gebäudeliste umschalten','切换建筑列表','建物一覧の切替','تبديل قائمة المباني','نمایش یا بستن فهرست ساختمان‌ها'],
  'auto-orbit':['órbita automática','rotation automatique','automatischer Rundflug','自动环绕','自動回転','دوران تلقائي','چرخش خودکار'],
  'toggle auto-orbit':['activar órbita automática','activer la rotation automatique','automatischen Rundflug umschalten','切换自动环绕','自動回転の切替','تبديل الدوران التلقائي','روشن یا خاموش کردن چرخش خودکار'],
  'reset view':['restablecer vista','réinitialiser la vue','Ansicht zurücksetzen','重置视图','表示のリセット','إعادة ضبط العرض','بازنشانی نما'],
  'reset camera':['restablecer cámara','réinitialiser la caméra','Kamera zurücksetzen','重置相机','カメラのリセット','إعادة ضبط الكاميرا','بازنشانی دوربین'],
  'help (?)':['ayuda (?)','aide (?)','Hilfe (?)','帮助 (?)','ヘルプ (?)','مساعدة (?)','راهنما (?)'],
  'open help':['abrir ayuda','ouvrir l’aide','Hilfe öffnen','打开帮助','ヘルプを開く','فتح المساعدة','باز کردن راهنما'],
  'Help: reading the city':['Ayuda: leer la ciudad','Aide : lire la ville','Hilfe: die Stadt lesen','帮助：阅读城市','ヘルプ：都市の見方','مساعدة: قراءة المدينة','راهنما: خواندن شهر'],
  'close (Esc)':['cerrar (Esc)','fermer (Esc)','schließen (Esc)','关闭 (Esc)','閉じる (Esc)','إغلاق (Esc)','بستن (Esc)'],
  'Buildings list':['Lista de edificios','Liste des bâtiments','Gebäudeliste','建筑列表','建物一覧','قائمة المباني','فهرست ساختمان‌ها'],
  'Choose a project folder.':['Elige una carpeta de proyecto.','Choisissez un dossier de projet.','Projektordner wählen.','请选择项目文件夹。','プロジェクトフォルダーを選択してください。','اختر مجلد مشروع.','پوشهٔ پروژه را انتخاب کنید.'],
  'Folder or file no longer exists.':['La carpeta o archivo ya no existe.','Le dossier ou fichier n’existe plus.','Ordner oder Datei existiert nicht mehr.','文件夹或文件已不存在。','フォルダーまたはファイルが見つかりません。','المجلد أو الملف لم يعد موجودًا.','پوشه یا فایل دیگر وجود ندارد.'],
  'Cannot access this folder. Choose a folder you have permission to read.':['No se puede acceder. Elige una carpeta con permiso de lectura.','Accès impossible. Choisissez un dossier que vous pouvez lire.','Kein Zugriff. Wählen Sie einen lesbaren Ordner.','无法访问，请选择有读取权限的文件夹。','読み取り権限のあるフォルダーを選択してください。','يتعذر الوصول. اختر مجلدًا لديك إذن لقراءته.','دسترسی به پوشه ممکن نیست. پوشه‌ای را انتخاب کنید که اجازهٔ خواندن آن را دارید.'],
  'A project is already being scanned. Please wait.':['Ya se está analizando un proyecto. Espera.','Un projet est en cours d’analyse. Patientez.','Ein Projekt wird bereits analysiert. Bitte warten.','正在扫描项目，请稍候。','プロジェクトを解析中です。お待ちください。','يجري تحليل مشروع. يرجى الانتظار.','پروژه‌ای در حال بررسی است. لطفاً صبر کنید.'],
  'Please wait for the scan.':['Espera al análisis.','Attendez la fin de l’analyse.','Bitte auf den Scan warten.','请等待扫描完成。','解析が終わるまでお待ちください。','انتظر اكتمال التحليل.','تا پایان بررسی صبر کنید.'],
  'Refresh CodeCity to reconnect.':['Actualiza CodeCity para reconectar.','Actualisez CodeCity pour reconnecter.','CodeCity neu laden, um sich zu verbinden.','刷新 CodeCity 以重新连接。','CodeCity を再読み込みしてください。','حدّث CodeCity لإعادة الاتصال.','برای اتصال دوباره CodeCity را تازه‌سازی کنید.'],
  '{n} components detected (total)':['{n} componentes detectados','{n} composants détectés','{n} Komponenten erkannt','检测到 {n} 个组件','{n} 個のコンポーネントを検出','تم اكتشاف {n} مكوّن','{n} جزء شناسایی شد'],
  'Static estimates from code size + detected manifests; not measured runtime usage.':['Estimaciones por tamaño y manifiestos; no es uso medido en ejecución.','Estimations basées sur la taille et les manifestes ; pas une mesure d’exécution.','Schätzungen aus Codegröße und Manifesten; keine gemessene Laufzeitnutzung.','根据代码规模和清单估算，非实测运行时用量。','コード規模と構成からの推定で、実行時の測定値ではありません。','تقديرات من حجم الشيفرة والملفات التعريفية؛ ليست قياس استخدام فعلي.','تخمین بر پایهٔ اندازهٔ کد و فایل‌های وابستگی؛ مصرف واقعی زمان اجرا نیست.'],
  '{n} vCPU under load':['{n} vCPU bajo carga','{n} vCPU en charge','{n} vCPU unter Last','负载下 {n} vCPU','負荷時 {n} vCPU','{n} vCPU تحت الحمل','{n} پردازندهٔ مجازی زیر بار'],
  '{n} MB resident':['{n} MB residentes','{n} Mo résidents','{n} MB im Speicher','常驻内存 {n} MB','常駐メモリー {n} MB','{n} MB مقيم','{n} مگابایت حافظهٔ مقیم'],
  'Project':['Proyecto','Projet','Projekt','项目','プロジェクト','المشروع','پروژه'],
  'Open project…':['Abrir proyecto…','Ouvrir un projet…','Projekt öffnen…','打开项目…','プロジェクトを開く…','فتح مشروع…','باز کردن پروژه…'],
  'Open project':['Abrir proyecto','Ouvrir un projet','Projekt öffnen','打开项目','プロジェクトを開く','فتح مشروع','باز کردن پروژه'],
  'Open recent':['Recientes','Projets récents','Zuletzt geöffnet','最近打开','最近のプロジェクト','المشاريع الأخيرة','پروژه‌های اخیر'],
  'Close project':['Cerrar proyecto','Fermer le projet','Projekt schließen','关闭项目','プロジェクトを閉じる','إغلاق المشروع','بستن پروژه'],
  'No recent projects':['Sin proyectos recientes','Aucun projet récent','Keine letzten Projekte','没有最近的项目','最近のプロジェクトはありません','لا توجد مشاريع أخيرة','پروژهٔ اخیری نیست'],
  'Project folder':['Carpeta del proyecto','Dossier du projet','Projektordner','项目文件夹','プロジェクトフォルダー','مجلد المشروع','پوشهٔ پروژه'],
  'Browse':['Explorar','Parcourir','Durchsuchen','浏览','参照','تصفح','مرور'],
  'Parent folder':['Carpeta superior','Dossier parent','Übergeordneter Ordner','上级文件夹','親フォルダー','المجلد الأب','پوشهٔ بالاتر'],
  'Open this folder':['Abrir esta carpeta','Ouvrir ce dossier','Diesen Ordner öffnen','打开此文件夹','このフォルダーを開く','فتح هذا المجلد','باز کردن این پوشه'],
  'Cancel':['Cancelar','Annuler','Abbrechen','取消','キャンセル','إلغاء','لغو'],
  'Choose a folder. CodeGraph and project dependencies are not required.':['Elige una carpeta. No necesitas CodeGraph ni las dependencias del proyecto.','Choisissez un dossier. CodeGraph et les dépendances du projet ne sont pas nécessaires.','Ordner wählen. CodeGraph und Projektabhängigkeiten sind nicht erforderlich.','选择文件夹，无需 CodeGraph 或项目依赖。','フォルダーを選択。CodeGraph やプロジェクトの依存関係は不要です。','اختر مجلدًا. لا تحتاج إلى CodeGraph أو تبعيات المشروع.','پوشه‌ای را انتخاب کنید. به CodeGraph یا وابستگی‌های پروژه نیازی نیست.'],
  'No project open':['Ningún proyecto abierto','Aucun projet ouvert','Kein Projekt geöffnet','未打开项目','プロジェクト未選択','لا يوجد مشروع مفتوح','پروژه‌ای باز نیست'],
  'Open a project to build its city.':['Abre un proyecto para construir su ciudad.','Ouvrez un projet pour construire sa ville.','Projekt öffnen, um seine Stadt zu bauen.','打开项目以构建代码城市。','プロジェクトを開いて都市を作成します。','افتح مشروعًا لبناء مدينته.','پروژه‌ای باز کنید تا شهر آن ساخته شود.'],
  'Scanning project…':['Analizando proyecto…','Analyse du projet…','Projekt wird analysiert…','正在扫描项目…','プロジェクトを解析中…','جارٍ تحليل المشروع…','در حال بررسی پروژه…'],
  'Could not open project.':['No se pudo abrir el proyecto.','Impossible d’ouvrir le projet.','Projekt konnte nicht geöffnet werden.','无法打开项目。','プロジェクトを開けませんでした。','تعذر فتح المشروع.','باز کردن پروژه ممکن نشد.'],
  'Start CodeCity with npm to use project controls.':['Inicia CodeCity con npm, el ejecutable o Docker para gestionar proyectos.','Démarrez CodeCity avec npm, l’exécutable ou Docker pour gérer les projets.','CodeCity mit npm, der Programmdatei oder Docker starten, um Projekte zu verwalten.','通过 npm、可执行文件或 Docker 启动 CodeCity 以管理项目。','npm、実行ファイル、Docker のいずれかで CodeCity を起動してください。','شغّل CodeCity عبر npm أو الملف التنفيذي أو Docker لإدارة المشاريع.','برای مدیریت پروژه‌ها، CodeCity را با npm، فایل اجرایی یا Docker اجرا کنید.'],
  'Explore':['Explorar','Explorer','Erkunden','探索','探索','استكشاف','کاوش'],
  'Legend':['Leyenda','Légende','Legende','图例','凡例','مفتاح الخريطة','راهنمای رنگ'],
  'Navigation':['Navegación','Navigation','Navigation','导航','操作','التنقل','پیمایش'],
  'search':['buscar','rechercher','suchen','搜索','検索','بحث','جستجو'],
  'class or file name…':['clase o archivo…','classe ou fichier…','Klassen- oder Dateiname…','类名或文件名…','クラス名・ファイル名…','اسم الصنف أو الملف…','نام کلاس یا فایل…'],
  'go':['ir','aller','los','前往','移動','اذهب','برو'],
  'district':['distrito','quartier','Bezirk','区域','地区','الحي','ناحیه'],
  'all districts':['todos los distritos','tous les quartiers','alle Bezirke','所有区域','すべての地区','كل الأحياء','همهٔ ناحیه‌ها'],
  'query / tag':['consulta / etiqueta','requête / étiquette','Abfrage / Markierung','查询 / 标记','クエリ / タグ','استعلام / وسم','پرس‌وجو / برچسب'],
  'run':['ejecutar','exécuter','ausführen','运行','実行','تشغيل','اجرا'],
  'clear':['limpiar','effacer','löschen','清除','クリア','مسح','پاک کردن'],
  'save…':['guardar…','enregistrer…','speichern…','保存…','保存…','حفظ…','ذخیره…'],
  'saved…':['guardadas…','enregistrées…','gespeichert…','已保存…','保存済み…','المحفوظة…','ذخیره‌شده…'],
  'saved queries':['consultas guardadas','requêtes enregistrées','gespeicherte Abfragen','已保存的查询','保存したクエリ','الاستعلامات المحفوظة','پرس‌وجوهای ذخیره‌شده'],
  'save query as':['guardar consulta como','enregistrer la requête sous','Abfrage speichern als','将查询保存为','クエリの保存名','حفظ الاستعلام باسم','ذخیرهٔ پرس‌وجو با نام'],
  'Map metrics':['Asignar métricas','Associer les métriques','Metriken zuordnen','映射指标','指標の割り当て','ربط المقاييس','نگاشت معیارها'],
  'height':['altura','hauteur','Höhe','高度','高さ','الارتفاع','ارتفاع'],
  'footprint':['base','emprise','Grundfläche','占地面积','底面積','المساحة','مساحت پایه'],
  'colour':['color','couleur','Farbe','颜色','色','اللون','رنگ'],
  'methods (NOM)':['métodos (NOM)','méthodes (NOM)','Methoden (NOM)','方法数 (NOM)','メソッド数 (NOM)','الأساليب (NOM)','متدها (NOM)'],
  'attributes (NOA)':['atributos (NOA)','attributs (NOA)','Attribute (NOA)','属性数 (NOA)','属性数 (NOA)','الخصائص (NOA)','ویژگی‌ها (NOA)'],
  'lines (LOC)':['líneas (LOC)','lignes (LOC)','Zeilen (LOC)','代码行数 (LOC)','行数 (LOC)','الأسطر (LOC)','خطوط (LOC)'],
  'lines of code (LOC)':['líneas de código (LOC)','lignes de code (LOC)','Codezeilen (LOC)','代码行数 (LOC)','コード行数 (LOC)','أسطر الشيفرة (LOC)','خطوط کد (LOC)'],
  'dependencies':['dependencias','dépendances','Abhängigkeiten','依赖','依存関係','التبعيات','وابستگی‌ها'],
  'language':['idioma','langue','Sprache','语言','言語','اللغة','زبان'],
  'Interface language':['Idioma de la interfaz','Langue de l’interface','Oberflächensprache','界面语言','表示言語','لغة الواجهة','زبان رابط کاربری'],
  'coverage':['cobertura','couverture','Abdeckung','覆盖率','カバレッジ','التغطية','پوشش'],
  'test coverage':['cobertura de pruebas','couverture des tests','Testabdeckung','测试覆盖率','テストカバレッジ','تغطية الاختبارات','پوشش آزمون'],
  'test coverage (grey = unknown)':['cobertura (gris = desconocida)','couverture (gris = inconnue)','Testabdeckung (grau = unbekannt)','测试覆盖率（灰色 = 未知）','カバレッジ（灰色 = 不明）','التغطية (الرمادي = غير معروف)','پوشش آزمون (خاکستری = نامشخص)'],
  'mapping':['escala','échelle','Skalierung','映射','尺度','التدرج','مقیاس'],
  'boxplot (5 sizes)':['cuartiles (5 tamaños)','quartiles (5 tailles)','Quartile (5 Größen)','箱线图（5种大小）','箱ひげ図（5サイズ）','مخطط صندوقي (5 أحجام)','نمودار جعبه‌ای (۵ اندازه)'],
  'linear':['lineal','linéaire','linear','线性','線形','خطي','خطی'],
  'threshold':['umbral','seuil','Schwellenwert','阈值','しきい値','عتبة','آستانه'],
  'history':['historial','historique','Verlauf','历史','履歴','السجل','تاریخچه'],
  'Export / compare':['Exportar / comparar','Exporter / comparer','Exportieren / vergleichen','导出 / 比较','出力 / 比較','تصدير / مقارنة','خروجی / مقایسه'],
  'model':['modelo','modèle','Modell','模型','モデル','النموذج','مدل'],
  'compare…':['comparar…','comparer…','vergleichen…','比较…','比較…','مقارنة…','مقایسه…'],
  'Layers':['Capas','Couches','Ebenen','图层','レイヤー','الطبقات','لایه‌ها'],
  'streets':['calles','rues','Straßen','街道','道路','الشوارع','خیابان‌ها'],
  'all':['todas','toutes','alle','全部','すべて','الكل','همه'],
  'selected building only':['solo edificio seleccionado','bâtiment sélectionné uniquement','nur ausgewähltes Gebäude','仅选中的建筑','選択した建物のみ','المبنى المحدد فقط','فقط ساختمان انتخاب‌شده'],
  'off':['desactivado','désactivé','aus','关闭','オフ','إيقاف','خاموش'],
  'grid':['cuadrícula','grille','Raster','网格','グリッド','الشبكة','شبکه'],
  'low':['bajo','bas','niedrig','低','低','منخفض','کم'],
  'high':['alto','haut','hoch','高','高','مرتفع','زیاد'],
  'folder / package':['carpeta / paquete','dossier / paquet','Ordner / Paket','文件夹 / 包','フォルダー / パッケージ','مجلد / حزمة','پوشه / بسته'],
  'kind':['tipo','type','Typ','类型','種類','النوع','نوع'],
  'file':['archivo','fichier','Datei','文件','ファイル','الملف','فایل'],
  'line':['línea','ligne','Zeile','行','行','السطر','خط'],
  'top-level funcs':['funciones globales','fonctions globales','globale Funktionen','顶层函数','トップレベル関数','دوال المستوى الأعلى','توابع سطح بالا'],
  'class':['clase','classe','Klasse','类','クラス','صنف','کلاس'],
  'module':['módulo','module','Modul','模块','モジュール','وحدة','ماژول'],
  'copy path':['copiar ruta','copier le chemin','Pfad kopieren','复制路径','パスをコピー','نسخ المسار','کپی مسیر'],
  'copied':['copiado','copié','kopiert','已复制','コピー済み','تم النسخ','کپی شد'],
  'copy unavailable':['copia no disponible','copie indisponible','Kopieren nicht verfügbar','无法复制','コピーできません','النسخ غير متاح','کپی در دسترس نیست'],
  'Open in file manager':['Abrir en el explorador','Ouvrir dans le gestionnaire de fichiers','Im Dateimanager öffnen','在文件管理器中打开','ファイルマネージャーで開く','فتح في مدير الملفات','باز کردن در مدیر فایل'],
  'Opening…':['Abriendo…','Ouverture…','Wird geöffnet…','正在打开…','開いています…','جارٍ الفتح…','در حال باز کردن…'],
  'File manager requires the native launcher.':['El explorador requiere el lanzador nativo.','Le gestionnaire de fichiers nécessite le lanceur natif.','Der Dateimanager benötigt den lokalen Launcher.','文件管理器需要本机启动器。','ファイルマネージャーにはネイティブ起動が必要です。','يتطلب مدير الملفات المشغّل المحلي.','مدیر فایل به اجرای بومی برنامه نیاز دارد.'],
  'close':['cerrar','fermer','schließen','关闭','閉じる','إغلاق','بستن'],
  'Minimize':['Minimizar','Réduire','Minimieren','最小化','最小化','تصغير','کوچک کردن'],
  'Buildings':['Edificios','Bâtiments','Gebäude','建筑','建物','المباني','ساختمان‌ها'],
  'filter…':['filtrar…','filtrer…','filtern…','筛选…','絞り込み…','تصفية…','فیلتر…'],
  'filter buildings':['filtrar edificios','filtrer les bâtiments','Gebäude filtern','筛选建筑','建物の絞り込み','تصفية المباني','فیلتر ساختمان‌ها'],
  'close list':['cerrar lista','fermer la liste','Liste schließen','关闭列表','一覧を閉じる','إغلاق القائمة','بستن فهرست'],
  'Infrastructure':['Infraestructura','Infrastructure','Infrastruktur','基础设施','インフラ','البنية التحتية','زیرساخت'],
  'No infrastructure data':['Sin datos de infraestructura','Aucune donnée d’infrastructure','Keine Infrastrukturdaten','无基础设施数据','インフラ情報なし','لا توجد بيانات بنية تحتية','اطلاعات زیرساخت موجود نیست'],
  'live':['en vivo','en direct','live','实时','ライブ','مباشر','زنده'],
  'poll the optional local metrics agent':['consultar el agente local opcional','interroger l’agent local facultatif','optionalen lokalen Metrikagenten abfragen','查询可选的本地指标代理','任意のローカル計測エージェントを使用','استعلام وكيل المقاييس المحلي الاختياري','دریافت از عامل اختیاری معیارهای محلی'],
  'source scan · estimated':['análisis de fuentes · estimado','analyse des sources · estimation','Quellscan · geschätzt','源码扫描 · 估算','ソース解析 · 推定','تحليل المصادر · تقديري','بررسی کد · تخمینی'],
  '{n} buildings':['{n} edificios','{n} bâtiments','{n} Gebäude','{n} 栋建筑','{n} 棟の建物','{n} مبنى','{n} ساختمان'],
  '{n} districts':['{n} distritos','{n} quartiers','{n} Bezirke','{n} 个区域','{n} 地区','{n} حي','{n} ناحیه'],
  '{n} roads':['{n} vías','{n} voies','{n} Straßen','{n} 条道路','{n} 道路','{n} طريق','{n} جاده'],
  '{n} streets':['{n} calles','{n} rues','{n} Straßen','{n} 条街道','{n} 道路','{n} شارع','{n} خیابان'],
  ' · {n} unrouted':[' · {n} sin ruta',' · {n} sans tracé',' · {n} ohne Route',' · {n} 条未布线',' · {n} 未描画',' · {n} دون مسار',' · {n} بدون مسیر'],
  'indexed · {n} nodes / {e} edges':['indexado · {n} nodos / {e} enlaces','indexé · {n} nœuds / {e} liens','indexiert · {n} Knoten / {e} Kanten','已索引 · {n} 节点 / {e} 边','索引 · {n} ノード / {e} エッジ','مفهرس · {n} عقدة / {e} رابط','نمایه‌شده · {n} گره / {e} یال'],
  'members ({n}) · click to highlight':['miembros ({n}) · clic para resaltar','membres ({n}) · cliquer pour surligner','Mitglieder ({n}) · zum Hervorheben klicken','成员 ({n}) · 点击高亮','メンバー ({n}) · クリックで強調','الأعضاء ({n}) · انقر للإبراز','اعضا ({n}) · برای برجسته‌سازی کلیک کنید'],
  'Show more ({n} remaining)':['Ver más ({n} restantes)','Afficher plus ({n} restants)','Mehr anzeigen ({n} übrig)','显示更多（剩余 {n}）','さらに表示（残り {n}）','عرض المزيد ({n} متبقٍ)','نمایش بیشتر ({n} باقی‌مانده)'],
  '{n} of {total} tagged · {query}':['{n} de {total} marcados · {query}','{n} sur {total} marqués · {query}','{n} von {total} markiert · {query}','已标记 {n}/{total} · {query}','{total} 中 {n} 件をタグ付け · {query}','{n} من {total} موسوم · {query}','{n} از {total} برچسب‌خورده · {query}'],
  'Queries could not be saved: browser storage is unavailable.':['No se pueden guardar consultas: almacenamiento no disponible.','Impossible d’enregistrer : stockage du navigateur indisponible.','Speichern fehlgeschlagen: Browserspeicher nicht verfügbar.','无法保存查询：浏览器存储不可用。','ブラウザーの保存領域が利用できません。','تعذر حفظ الاستعلام: تخزين المتصفح غير متاح.','ذخیرهٔ پرس‌وجو ممکن نیست: حافظهٔ مرورگر در دسترس نیست.'],
  '{a} new · {c} changed · {r} removed · LOC {d}':['{a} nuevos · {c} cambiados · {r} eliminados · LOC {d}','{a} nouveaux · {c} modifiés · {r} supprimés · LOC {d}','{a} neu · {c} geändert · {r} entfernt · LOC {d}','新增 {a} · 修改 {c} · 删除 {r} · LOC {d}','追加 {a} · 変更 {c} · 削除 {r} · LOC {d}','{a} جديد · {c} معدّل · {r} محذوف · LOC {d}','{a} جدید · {c} تغییرکرده · {r} حذف‌شده · LOC {d}'],
  'could not read baseline ({error})':['no se pudo leer la referencia ({error})','lecture de référence impossible ({error})','Vergleichsmodell nicht lesbar ({error})','无法读取基线 ({error})','比較モデルを読めません ({error})','تعذر قراءة المرجع ({error})','خواندن مدل پایه ممکن نشد ({error})'],
  'loading city.json …':['cargando city.json…','chargement de city.json…','city.json wird geladen…','正在加载 city.json…','city.json を読み込み中…','جارٍ تحميل city.json…','در حال بارگذاری city.json…'],
  'building the city …':['construyendo la ciudad…','construction de la ville…','Stadt wird gebaut…','正在构建城市…','都市を作成中…','جارٍ بناء المدينة…','در حال ساخت شهر…'],
  'Help · reading the city':['Ayuda · leer la ciudad','Aide · lire la ville','Hilfe · die Stadt lesen','帮助 · 阅读城市','ヘルプ · 都市の見方','مساعدة · قراءة المدينة','راهنما · خواندن شهر'],
  'what the metrics mean and how to analyse a codebase':['qué significan las métricas y cómo analizar código','comprendre les métriques et analyser le code','Metriken verstehen und Code analysieren','指标含义与代码分析方法','指標の意味とコードの解析方法','معاني المقاييس وكيفية تحليل الشيفرة','معنای معیارها و روش تحلیل کد'],
  'City guide':['Guía de la ciudad','Guide de la ville','Stadtführer','城市指南','都市ガイド','دليل المدينة','راهنمای شهر'],
  'Each class or module is a building; folders are districts. Height represents methods (NOM), footprint attributes (NOA), and colour lines of code (LOC).':['Cada clase o módulo es un edificio; las carpetas son distritos. Altura = métodos (NOM), base = atributos (NOA), color = líneas (LOC).','Chaque classe ou module est un bâtiment ; les dossiers sont des quartiers. Hauteur = méthodes (NOM), emprise = attributs (NOA), couleur = lignes (LOC).','Klassen oder Module sind Gebäude, Ordner sind Bezirke. Höhe = Methoden (NOM), Grundfläche = Attribute (NOA), Farbe = Codezeilen (LOC).','每个类或模块是一栋建筑，文件夹是区域。高度表示方法数 (NOM)，占地面积表示属性数 (NOA)，颜色表示代码行数 (LOC)。','クラスやモジュールは建物、フォルダーは地区です。高さはメソッド数 (NOM)、底面積は属性数 (NOA)、色はコード行数 (LOC) です。','كل صنف أو وحدة مبنى، والمجلدات أحياء. الارتفاع للأساليب (NOM)، والمساحة للخصائص (NOA)، واللون لأسطر الشيفرة (LOC).','هر کلاس یا ماژول یک ساختمان است؛ پوشه‌ها ناحیه‌اند. ارتفاع نشان‌دهندهٔ متدها (NOM)، مساحت پایه ویژگی‌ها (NOA) و رنگ خطوط کد (LOC) است.'],
  'Open a project from the Project menu. Mixed languages are scanned together without installing Python, CodeGraph, compilers, or project dependencies.':['Abre un proyecto desde el menú. Los lenguajes combinados se analizan sin instalar Python, CodeGraph, compiladores ni dependencias.','Ouvrez un projet via le menu. Les langages mixtes sont analysés sans installer Python, CodeGraph, compilateurs ni dépendances.','Projekt im Menü öffnen. Gemischte Sprachen werden ohne Python, CodeGraph, Compiler oder Projektabhängigkeiten analysiert.','从项目菜单打开文件夹。混合语言一起扫描，无需安装 Python、CodeGraph、编译器或项目依赖。','プロジェクトメニューから開きます。Python、CodeGraph、コンパイラー、依存関係のインストールは不要です。','افتح مشروعًا من القائمة. تُحلّل اللغات المختلطة دون تثبيت Python أو CodeGraph أو المترجمات أو التبعيات.','پروژه را از منوی پروژه باز کنید. زبان‌های ترکیبی بدون نصب Python، CodeGraph، کامپایلر یا وابستگی‌های پروژه بررسی می‌شوند.'],
  'Select a building to highlight its connected streets and pedestrians. Use the file manager button to locate its source file.':['Selecciona un edificio para resaltar sus calles y peatones. Usa el explorador para localizar su archivo.','Sélectionnez un bâtiment pour surligner ses rues et piétons. Le gestionnaire de fichiers permet de retrouver sa source.','Gebäude auswählen, um Straßen und Fußgänger hervorzuheben. Die Dateimanager-Schaltfläche zeigt die Quelldatei.','选择建筑以高亮其连接街道和行人。用文件管理器按钮定位源文件。','建物を選択すると接続した道路と歩行者が強調されます。ファイルマネージャーでソースを探せます。','حدد مبنى لإبراز شوارعه والمشاة. استخدم زر مدير الملفات للعثور على مصدره.','ساختمان را انتخاب کنید تا خیابان‌ها و عابران متصل برجسته شوند. دکمهٔ مدیر فایل، فایل منبع را نشان می‌دهد.'],
  'Portable scans estimate class, method, and attribute counts. Streets represent resolvable local imports, not a complete call graph; runtime links between languages may be absent.':['El análisis portátil estima clases, métodos y atributos. Las calles son importaciones locales detectadas; pueden faltar enlaces entre lenguajes en ejecución.','L’analyse portable estime classes, méthodes et attributs. Les rues représentent les imports locaux résolus ; des liens entre langages peuvent manquer.','Der portable Scan schätzt Klassen, Methoden und Attribute. Straßen zeigen auflösbare lokale Imports; Laufzeitverbindungen zwischen Sprachen können fehlen.','便携扫描估算类、方法和属性。街道表示可解析的本地导入，并非完整调用图；可能缺少跨语言运行时连接。','解析はクラス・メソッド・属性の推定値です。道路は解決できるローカルのインポートを表し、異なる言語間の実行時接続は表示できない場合があります。','التحليل المحمول يقدّر الأصناف والأساليب والخصائص. الشوارع واردات محلية قابلة للحل وليست رسم استدعاءات كاملًا؛ قد تغيب روابط اللغات وقت التشغيل.','بررسی قابل‌حمل تعداد کلاس‌ها، متدها و ویژگی‌ها را تخمین می‌زند. خیابان‌ها importهای محلی قابل‌شناسایی‌اند، نه گراف کامل فراخوانی؛ ارتباط زمان اجرای زبان‌ها ممکن است دیده نشود.'],
  'Drag to orbit, wheel to zoom, right-drag to pan. Use [ and ] to select buildings with the keyboard.':['Arrastra para orbitar, rueda para acercar, arrastre derecho para desplazar. [ y ] seleccionan edificios.','Glissez pour tourner, molette pour zoomer, bouton droit pour déplacer. [ et ] sélectionnent les bâtiments.','Ziehen zum Drehen, Mausrad zum Zoomen, Rechtsziehen zum Verschieben. [ und ] wählen Gebäude.','拖动旋转，滚轮缩放，右键拖动平移。按 [ 和 ] 选择建筑。','ドラッグで回転、ホイールで拡大縮小、右ドラッグで移動。[ と ] で建物を選択します。','اسحب للدوران، عجلة للتكبير، اسحب بالزر الأيمن للتحريك. استخدم [ و ] لتحديد المباني.','کشیدن برای چرخش، چرخ ماوس برای بزرگ‌نمایی و کشیدن با دکمهٔ راست برای جابه‌جایی. با [ و ] ساختمان‌ها را انتخاب کنید.'],
  'Fold panels using their header buttons. Close project returns to an empty city and keeps your recent projects.':['Pliega paneles con sus cabeceras. Cerrar proyecto vuelve a la ciudad vacía y conserva los recientes.','Repliez les panneaux avec leur en-tête. Fermer le projet rend la ville vide et conserve les projets récents.','Panels über ihre Kopfzeile einklappen. Projekt schließen zeigt eine leere Stadt und behält zuletzt geöffnete Projekte.','通过标题按钮折叠面板。关闭项目返回空城市并保留最近项目。','見出しのボタンでパネルを折り畳めます。閉じると空の都市になり、最近のプロジェクトは保存されます。','اطوِ اللوحات بأزرار العنوان. إغلاق المشروع يعيد مدينة فارغة ويحفظ المشاريع الأخيرة.','پنل‌ها را با دکمهٔ عنوان جمع کنید. بستن پروژه شهر را خالی می‌کند و پروژه‌های اخیر را نگه می‌دارد.'],
  'drag = orbit · wheel = zoom · right-drag = pan · click a building for details':['arrastrar = orbitar · rueda = zoom · arrastre derecho = desplazar · clic = detalles','glisser = tourner · molette = zoom · clic droit glissé = déplacer · clic = détails','Ziehen = drehen · Mausrad = zoomen · Rechtsziehen = verschieben · Klick = Details','拖动 = 旋转 · 滚轮 = 缩放 · 右键拖动 = 平移 · 点击建筑查看详情','ドラッグ = 回転 · ホイール = 拡大縮小 · 右ドラッグ = 移動 · クリック = 詳細','سحب = دوران · عجلة = تكبير · سحب أيمن = تحريك · انقر مبنى للتفاصيل','کشیدن = چرخش · چرخ ماوس = بزرگ‌نمایی · کشیدن راست = جابه‌جایی · کلیک روی ساختمان = جزئیات'],
};
const reverse=new Map();
const sources=new WeakMap();
for(const [key,values] of Object.entries(messages))for(const value of values)reverse.set(value,key);
export function t(key, vars={}) {
  let text=locale==='en'?key:(messages[key]?.[locales.indexOf(locale)-1]||key);
  return text.replace(/\{(\w+)\}/g,(all,name)=>vars[name]??all);
}
export function getLocale(){return locale;}
export function translate(root=document.body) {
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())) {
    if(node.parentElement.closest('script,style,.details-name,.details-sub,.member-name,.lr-name,.lr-meta,.recent-project,.folder-row,.infra-names,#folder-path'))continue;
    const text=node.textContent,trimmed=text.trim();
    const old=sources.get(node);
    const source=old?.last===text?old.source:(reverse.get(trimmed)||trimmed);
    const translated=t(source);
    sources.set(node,{source,last:text.replace(trimmed,translated)});
    if(trimmed&&translated!==trimmed)node.textContent=text.replace(trimmed,translated);
  }
  for(const el of root.querySelectorAll('[title],[placeholder],[aria-label]'))for(const attr of ['title','placeholder','aria-label']) {
    const value=el.getAttribute(attr);
    const translated=value&&t(reverse.get(value)||value);
    if(value&&translated!==value)el.setAttribute(attr,translated);
  }
  applyTooltips(root,t);
}
export function setLocale(value) {
  locale=locales.includes(value)?value:'en';
  document.documentElement.lang=locale;document.documentElement.dir=['ar','fa'].includes(locale)?'rtl':'ltr';
  try{localStorage.setItem('codecity.locale',locale);}catch{}
  document.getElementById('ui-language').value=locale;
  window.dispatchEvent(new Event('languagechange'));translate();
}
export function initI18n() {
  let saved='en';try{saved=localStorage.getItem('codecity.locale')||'en';}catch{}
  document.getElementById('ui-language').onchange=e=>setLocale(e.target.value);
  translate();
  setLocale(saved);
  new MutationObserver(()=>translate()).observe(document.body,{childList:true,subtree:true,characterData:true});
}
