"""Report charts matching frontend/docs/CHART_PLAN.md; never overwrite legacy PNGs."""
import os,json,hashlib,argparse,warnings
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--project-root',type=Path,default=Path(r'C:\Users\User\Documents\Codex\CHARGE GAP'))
parser.add_argument('--inputs',type=Path)
parser.add_argument('--repair-numbers',type=int,nargs='*',default=[])
args=parser.parse_args(); P=args.project_root
if args.inputs is None:args.inputs=P/'reports/chart_v2_api_inputs.json'
os.environ.setdefault('MPLCONFIGDIR',str(Path(__file__).parent/'mplconfig_v2'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager,cbook
from matplotlib.patches import Rectangle
from matplotlib.ticker import StrMethodFormatter,ScalarFormatter
import numpy as np
import pandas as pd
import seaborn as sns
from PIL import Image
font_manager.fontManager.addfont(r'C:\Windows\Fonts\malgun.ttf')
sns.set_theme(style='whitegrid',font='Malgun Gothic',rc={'axes.unicode_minus':False})
plt.rcParams.update({'font.size':11,'axes.titlesize':14,'axes.labelsize':12,'legend.fontsize':10})
warnings.filterwarnings('error',message='Glyph .* missing')
D=json.loads(args.inputs.read_text(encoding='utf-8'))
O=P/'outputs/charts_v2_report'; O.mkdir(exist_ok=True)
R=P/'reports'; charts=[]; checks=[]
raw=pd.read_csv(P/'data/processed/charger_info_clean.csv',dtype=str,keep_default_na=False,
    usecols=['zcode','statId','chgerId','delYn','chgerType','busiId','busiNm','output'])
for column in raw:raw[column]=raw[column].str.strip()
frame=raw.loc[raw.delYn.eq('N')]
assert len(raw)==527433 and len(frame)==523312 and not raw.duplicated(['statId','chgerId']).any()
ev=pd.DataFrame(D['ev-registration']['data']); regions=pd.DataFrame(D['charger-regions']['data'])
truth_ev=pd.read_csv(P/'data/processed/ev_registration_by_region_2025.csv',dtype={'region_code_2025':str})
for column in ['ev_registration_count','ev_passenger_count','ev_bus_count','ev_truck_count','ev_special_count','ev_noncommercial_count','ev_commercial_count']:
    assert ev.set_index('region_code_2025')[column].sort_index().equals(truth_ev.set_index('region_code_2025')[column].sort_index())
types=pd.DataFrame(D['charger-types']['data']); outputs=pd.DataFrame(D['charger-output']['data'])
growth=pd.DataFrame(D['growth']['data']); boxes=D['station-size-distribution']['data']
for row in regions.itertuples():
    f=frame.loc[frame.zcode.eq(row.region_code)]
    assert row.charger_count==len(f) and row.station_count==f.statId.nunique()
    checks.append({'check':'region_counts','region_code':row.region_code,'charger_count':len(f),'station_count':int(f.statId.nunique())})
sizes=frame.groupby(['zcode','statId']).chgerId.nunique()
for row in boxes:
    values=sizes.loc[row['region_code']].to_numpy()
    expected=cbook.boxplot_stats(values,whis=1.5,autorange=False)[0]
    for actual,key in [('q1','q1'),('median','med'),('q3','q3'),('whisker_low','whislo'),('whisker_high','whishi')]:
        assert row[actual]==expected[key]
    assert row['outlier_count']==len(expected['fliers']) and row['sample_count']==len(values)
    assert sum(x['station_count'] for x in row['outlier_distribution'])==len(expected['fliers'])
assert sum(r['sample_count'] for r in boxes)==frame.statId.nunique()==100590
assert sum(r['charger_count'] for r in boxes)==len(frame)
api_date='한국환경공단 getChargerInfo · 2026-10-15 04:16–04:19 KST 조회'
ev_date='2025년 12월 자동차 등록자료 · 순수 전기차 · 원래 17개 시도'
api_caution='비삭제 표시(N)만 집계 · 실제 이용 가능 상태를 뜻하지 않음 · 현재 16개 지역 유지'
colors=sns.color_palette('Blues',8)[2:]+sns.color_palette('crest',8)

def canvas(title,subtitle,source=api_date,caution=api_caution,height=8):
    fig,ax=plt.subplots(figsize=(14,height))
    fig.subplots_adjust(left=.12,right=.95,bottom=.23,top=.80)
    fig.text(.08,.93,title,fontsize=21,weight='bold',color='#16364B')
    fig.text(.08,.87,subtitle,fontsize=11,color='#42596A')
    fig.text(.08,.105,'출처·기준: '+source,fontsize=10,color='#42596A')
    fig.text(.08,.055,caution,fontsize=10,color='#42596A')
    return fig,ax

def save(fig,n,name,purpose,variables,kind,reason,result,metrics,source=api_date,caution=api_caution):
    file=f'v2_{n:02d}_{name}.png'; path=O/file
    fig.canvas.draw(); renderer=fig.canvas.get_renderer(); width,height=fig.canvas.get_width_height()
    important=list(fig.texts)
    for axis in fig.axes:
        important += [axis.xaxis.label,axis.yaxis.label]
        if axis.get_legend() is not None:important.append(axis.get_legend())
    for artist in important:
        if not artist.get_visible():continue
        bounds=artist.get_window_extent(renderer)
        if bounds.width>0 and bounds.height>0:
            assert bounds.x0>=0 and bounds.y0>=0 and bounds.x1<=width and bounds.y1<=height,(n,'clipped label',bounds.bounds)
    if path.exists() and n not in args.repair_numbers:
        if not args.repair_numbers:raise FileExistsError('Existing chart preserved: '+str(path))
        plt.close(fig)
        previous=json.loads((R/'chart_v2_verification.json').read_text(encoding='utf-8'))
        charts.append(next(c for c in previous['charts'] if c['number']==n))
        return
    fig.savefig(path,dpi=200,facecolor='white');plt.close(fig)
    with Image.open(path) as im:
        im.verify()
    with Image.open(path) as im:
        pixels=list(im.size); dpi=list(im.info['dpi'])
    charts.append(dict(number=n,file=file,purpose=purpose,variables=variables,kind=kind,reason=reason,
        results=result,metrics=metrics,source=source,caution=caution,image_pixels=pixels,dpi=dpi,
        sha256=hashlib.sha256(path.read_bytes()).hexdigest()))

# 1: unchanged visual grammar, newly named report output.
top=ev.nlargest(10,'ev_registration_count').sort_values('ev_registration_count')
fig,ax=canvas('지역별 전기차 등록 TOP 10','전국 899,101대 중 상위 10개 지역',ev_date,'2025년 12월 등록 자료 · 2026년 충전기 자료와 동일 시점 비교 불가')
ax.barh(top.region_name_2025,top.ev_registration_count,color='#276C9B')
ax.bar_label(ax.containers[0],fmt='{:,.0f}',padding=4);ax.set_xlim(0,top.ev_registration_count.max()*1.17)
ax.set_xlabel('전기차 등록 대수 (대)');ax.set_ylabel('지역');ax.xaxis.set_major_formatter(StrMethodFormatter('{x:,.0f}'))
save(fig,1,'ev_top10','지역별 전기차 규모 비교',['region_name_2025','ev_registration_count'],'가로 막대',
    '긴 지역명을 읽고 순위를 비교하기 쉽다.',f'경기 {int(top.iloc[-1].ev_registration_count):,}대로 전국의 {top.iloc[-1].ev_registration_count/899101*100:.2f}%.',
    {'national_total':899101,'top10_total':int(top.ev_registration_count.sum())},ev_date,'2025년 등록 규모이며 충전기 부족률을 계산하지 않는다.')

# 2 vehicle donut.
vehicle_cols=['ev_passenger_count','ev_bus_count','ev_truck_count','ev_special_count']
values=ev[vehicle_cols].sum(); assert int(values.sum())==899101
fig,ax=canvas('전기차 차종별 등록 구성','2025년 12월 · 순수 전기차 899,101대',ev_date,'하이브리드·수소전기 제외 · 비율은 등록 대수 기준')
labels=['승용','승합','화물','특수']; wedges,_=ax.pie(values,colors=colors[:4],startangle=90,wedgeprops={'width':.38,'edgecolor':'white'})
ax.text(0,0,'899,101대',ha='center',va='center',fontsize=21,weight='bold')
ax.legend(wedges,[f'{l}  {v:,}대 ({v/899101*100:.2f}%)' for l,v in zip(labels,values)],loc='center left',bbox_to_anchor=(1,.5))
save(fig,2,'vehicle_donut','차종 구성 파악',vehicle_cols,'도넛','전체 대비 차종별 비중을 표시한다.',
    f'승용 {values.iloc[0]:,}대 ({values.iloc[0]/899101*100:.2f}%), 화물 {values.iloc[2]:,}대.',values.to_dict(),ev_date,'등록 대수 비율이며 실제 운행량이나 충전 수요 비율이 아니다.')

# 3 100% commercial composition.
ordered=ev.assign(commercial_pct=ev.ev_commercial_count/ev.ev_registration_count*100).sort_values('commercial_pct')
fig,ax=canvas('지역별 사업용·비사업용 전기차 구성','지역별 등록 대수 합계 = 100% · 원래 17개 시도',ev_date,'구성비 비교 · 지역별 절대 등록 규모는 서로 다름',height=10)
ax.barh(ordered.region_name_2025,100-ordered.commercial_pct,label='비사업용',color='#276C9B')
ax.barh(ordered.region_name_2025,ordered.commercial_pct,left=100-ordered.commercial_pct,label='사업용',color='#D6864A')
ax.set(xlabel='지역 내 등록 구성비 (%)',ylabel='지역',xlim=(0,100));ax.legend(loc='lower center',bbox_to_anchor=(.5,1.01),ncol=2)
save(fig,3,'commercial_percent','용도별 구성 비교',['ev_commercial_count','ev_noncommercial_count'],'100% 누적 가로 막대',
    '절대 규모의 영향을 분리하여 지역 내 구성비를 비교한다.',
    f'전국 사업용 {int(ev.ev_commercial_count.sum()):,}대 ({ev.ev_commercial_count.sum()/899101*100:.2f}%). 사업용 비율 최대 {ordered.iloc[-1].region_name_2025} {ordered.iloc[-1].commercial_pct:.2f}%.',
    {'commercial_total':int(ev.ev_commercial_count.sum()),'noncommercial_total':int(ev.ev_noncommercial_count.sum()),'regional_percentages':dict(zip(ordered.region_name_2025,ordered.commercial_pct))},ev_date,'사업용 여부만으로 실제 주행거리 또는 충전 수요를 추정하지 않는다.')

# 4 OLS, unweighted 16 regions.
x=regions.station_count.to_numpy(float);y=regions.charger_count.to_numpy(float)
slope,intercept=np.polyfit(x,y,1);r=np.corrcoef(x,y)[0,1];r2=r*r
fig,ax=canvas('지역별 충전소와 충전기 규모','16개 지역의 비삭제 데이터 · 최소제곱 회귀 (지역별 동일 가중치)')
fig.subplots_adjust(right=.76)
for i,row in enumerate(regions.itertuples()):
    ax.scatter(row.station_count,row.charger_count,s=70,color=sns.color_palette('tab20',16)[i],label=row.region_name,zorder=3,edgecolor='#42596A',linewidth=.4)
grid=np.linspace(x.min(),x.max(),100);ax.plot(grid,intercept+slope*grid,color='#D6864A',label=f'OLS: y={slope:.3f}x{intercept:+,.1f} · R²={r2:.4f}')
for row in regions.nlargest(2,'charger_count').itertuples():
    ax.annotate(row.region_name,(row.station_count,row.charger_count),xytext=(-10,10),textcoords='offset points',fontsize=10)
ax.set(xlabel='충전소 수 (곳)',ylabel='충전기 수 (기)')
handles,legend_labels=ax.get_legend_handles_labels()
ax.legend(handles[:-1],legend_labels[:-1],loc='upper left',bbox_to_anchor=(1.02,1),fontsize=10,title='지역')
ax.text(.04,.94,f'OLS y={slope:.3f}x {intercept:+,.1f}\nPearson r={r:.4f} · R²={r2:.4f}',transform=ax.transAxes,fontsize=11,color='#9B5D32',va='top')
ax.xaxis.set_major_formatter(StrMethodFormatter('{x:,.0f}'));ax.yaxis.set_major_formatter(StrMethodFormatter('{x:,.0f}'))
save(fig,4,'stations_chargers_regression','지역 규모의 연관성 탐색',['station_count','charger_count'],'산점도·회귀선','두 수치 변수의 관계와 지역별 편차를 보여준다.',
    f'16개 지역 Pearson r={r:.5f}, R²={r2:.5f}, 회귀 기울기 {slope:.5f}. 전국 비삭제 충전소 100,590곳·충전기 523,312기.',
    {'n':16,'pearson_r':r,'slope':slope,'intercept':intercept,'r_squared':r2},caution=api_caution+' · 상관관계는 인과관계가 아님')

# 5 explicit bxp stats: no independent renderer whisker convention.
fig,ax=canvas('지역별 충전소당 충전기 수 분포','선형 보간 사분위수 · 관측값 중 1.5×IQR 울타리 안의 양 끝을 수염으로 표시',height=11)
bx=[]
for row in boxes:
    bx.append({'label':f"{row['region_name']} (n={row['sample_count']:,})",'q1':row['q1'],'med':row['median'],'q3':row['q3'],
        'whislo':row['whisker_low'],'whishi':row['whisker_high'],'mean':row['mean'],
        'fliers':[item['charger_count'] for item in row['outlier_distribution']]})
ax.bxp(bx,orientation='horizontal',showmeans=True,patch_artist=True,
    boxprops={'facecolor':'#9DC6D9'},medianprops={'color':'#16364B','linewidth':1.5},
    flierprops={'marker':'.','markersize':4,'alpha':.4},meanprops={'marker':'D','markerfacecolor':'#D6864A','markersize':4})
ax.set_xscale('log');ax.xaxis.set_major_formatter(ScalarFormatter());ax.set(xlabel='충전소당 충전기 수 (기/곳, 로그 축)',ylabel='지역 (n=표본 충전소 수)')
ax.invert_yaxis();fig.subplots_adjust(left=.28)
fig.text(.29,.16,'상자: Q1–Q3 · 세로선: 중앙값 · ◆: 평균 · 점: 이상치 (같은 값은 겹쳐 표시)',fontsize=10)
total_outliers=sum(row['outlier_count'] for row in boxes)
save(fig,5,'station_size_boxplot','지역별 충전소 규모 분포 비교',['zcode','statId','chgerId'],'박스플롯',
    '원시 충전소 관측 분포의 중앙값·산포·극단값을 함께 보여준다.',
    f'표본 100,590곳, 지역별 1.5×IQR 기준 이상치 {total_outliers:,}곳. 지역 중앙값 범위 {min(r["median"] for r in boxes):g}–{max(r["median"] for r in boxes):g}기/곳.',
    {'sample_count':100590,'outlier_count':total_outliers,'regions':boxes},
    caution=api_caution+' · 이상치는 오류 판정이 아니며 제거하지 않음')

# 6 types top4 + other.
ordered=types.sort_values('charger_count',ascending=False);top=ordered.head(4);other=int(ordered.iloc[4:].charger_count.sum())
vals=list(top.charger_count)+[other]; labels=[f'{row.charger_type_code} {row.official_definition}' for row in top.itertuples()]+['기타 유형']
assert sum(vals)==len(frame)
fig,ax=canvas('충전기 유형별 구성','공식 커넥터 유형 · 상위 4개 유형 + 기타')
wedges,_=ax.pie(vals,startangle=90,colors=colors[:5],wedgeprops={'width':.4,'edgecolor':'white'})
ax.text(0,0,'523,312기',ha='center',va='center',fontsize=19)
ax.legend(wedges,[f'{l}: {v:,}기 ({v/len(frame)*100:.2f}%)' for l,v in zip(labels,vals)],loc='center left',bbox_to_anchor=(.9,.5),fontsize=9)
save(fig,6,'type_top4_donut','공식 유형 구성 파악',['chgerType'],'도넛','다수 유형을 상위4와 기타로 묶어 읽기 쉽게 표현한다.',
    f'02 AC완속 {int(ordered.iloc[0].charger_count):,}기 ({ordered.iloc[0].charger_count/len(frame)*100:.2f}%). 기타 {other:,}기.',
    {'labels':labels,'charger_counts':vals},caution=api_caution+' · 커넥터 유형을 출력 구간으로 해석하지 않음')

# 7 frontend log10 equal-width histogram and fixed-bandwidth weighted Gaussian KDE.
v=pd.to_numeric(frame.output,errors='coerce');positive=v.loc[v.gt(0)].to_numpy()
freq=pd.Series(positive).value_counts().sort_index();bw=.125
edges=np.arange(np.floor(np.log10(positive.min())/bw)*bw,np.ceil(np.log10(positive.max())/bw)*bw+bw/2,bw)
hist,_=np.histogram(np.log10(positive),bins=edges)
assert hist.sum()==len(positive)==523143
grid=np.linspace(edges[0],edges[-1],300)
kernel=np.exp(-.5*((grid[:,None]-np.log10(freq.index.to_numpy())[None,:])/bw)**2)/(np.sqrt(2*np.pi)*bw)
kde=kernel@freq.to_numpy()*bw
fig,ax=canvas('충전기 출력 분포와 KDE','log10 등폭 구간·폭 0.125 · 가중 Gaussian KDE 대역폭 0.125 (log10 단위)')
ax.bar(10**edges[:-1],hist,width=np.diff(10**edges),align='edge',color='#76A9C5',edgecolor='white',label='관측 충전기 수')
ax.plot(10**grid,kde,color='#D6864A',linewidth=2,label='KDE × 표본 수 × 구간폭')
ax.set_xscale('log');ax.set_xticks([3,7,10,30,50,100,200,400]);ax.xaxis.set_major_formatter(ScalarFormatter())
ax.set(xlabel='충전기 출력 (kW, 로그 축)',ylabel='충전기 수 (기/로그 구간)');ax.legend()
save(fig,7,'output_histogram_kde','출력 집중과 분포 탐색',['output'],'히스토그램·KDE','연속 출력의 빈도와 평활 추정 분포를 함께 보여준다.',
    f'유효 양수 {len(positive):,}기, 결측·무효 {len(frame)-len(positive):,}기. 7kW {int((positive==7).sum()):,}기, 중앙값 {np.median(positive):g}kW.',
    {'valid_positive_count':len(positive),'missing_or_invalid':len(frame)-len(positive),'bin_edges_log10':edges.tolist(),'bin_counts':hist.tolist(),'kde_bandwidth_log10':bw,'seven_kw_count':int((positive==7).sum())},
    caution=api_caution+' · KDE는 평활 추정 · 명목 출력은 실측 충전속도가 아님')

# 8 six-band row normalized heatmap, independently recalculated.
bands=['30 미만','30–50 미만','50–100 미만','100–200 미만','200 이상','미상']
band=pd.cut(v,[0,30,50,100,200,np.inf],right=False,labels=bands[:5]).astype('object').fillna('미상')
counts=pd.crosstab(frame.zcode,band).reindex(index=regions.region_code,columns=bands,fill_value=0)
assert counts.sum().sum()==len(frame)
assert counts.loc['41'].tolist()==[140694,578,2694,7104,3764,43]
percent=counts.div(counts.sum(axis=1),axis=0)*100
assert np.allclose(percent.sum(axis=1),100)
fig,ax=canvas('지역별 충전 출력 구성','지역 내 비삭제 충전기 = 100% · 출력 구간별 구성비',height=10)
fig.subplots_adjust(left=.22)
sns.heatmap(percent,annot=True,fmt='.1f',cmap='Blues',vmin=0,vmax=100,yticklabels=regions.region_name,ax=ax,cbar_kws={'label':'지역 내 비율 (%)'})
ax.set(xlabel='출력 구간 (kW)',ylabel='지역');ax.tick_params(axis='y',rotation=0)
save(fig,8,'regional_output_heatmap','지역별 출력 구성 비교',['zcode','output'],'히트맵','동일 비율 척도로 16개 지역의 출력 구간 구성을 비교한다.',
    f'30kW 미만 {int(counts.iloc[:,0].sum()):,}기, 미상 {int(counts.iloc[:,-1].sum()):,}기. 지역별 행 합계 100%.',
    {'bands':bands,'counts':{str(k):[int(v) for v in row] for k,row in counts.iterrows()},'total':len(frame)},
    caution=api_caution+' · 비율은 지역 내 충전기 수 기준이며 공급전력 점유율이 아님')

# 9 cumulative installations, independent historical source.
truth_growth=pd.read_csv(P/'data/processed/charger_installation_trend.csv')
assert growth.cumulative_count.tolist()==truth_growth.cumulative_count.tolist()
assert np.array_equal(np.cumsum(growth.annual_installed_count),growth.cumulative_count)
fig,ax=canvas('연도별 누적 충전기 설치 통계','2011–2026년 · 2026년은 부분 연도',
    '충전기 설치 성장 추세 Excel → 정제 CSV · 파일명 2026-10-15, 정확한 마감일 미기재',
    '2026년은 미완결 연도 · API 현재 재고와 모집단이 다름 · statUpdDt를 설치일로 사용하지 않음')
ax.fill_between(growth.year,growth.cumulative_count,color='#9BC5CD',alpha=.7,label='누적 설치 통계')
ax.plot(growth.year,growth.cumulative_count,color='#26777C',marker='o',markersize=4)
ax.axvspan(2025.5,2026.4,color='#E7B06B',alpha=.25,label='2026 부분 연도')
ax.annotate('2026 부분 연도\n540,210기',(2026,540210),xytext=(-100,-3),textcoords='offset points',ha='right')
ax.set(xlabel='연도 (년)',ylabel='누적 설치 수 (기)',xlim=(2011,2026.4));ax.legend(loc='upper left');ax.yaxis.set_major_formatter(StrMethodFormatter('{x:,.0f}'))
save(fig,9,'cumulative_installation_area','누적 설치 통계의 변화 파악',['year','annual_installed_count','cumulative_count'],'영역 그래프',
    '누적 규모의 시간별 변화를 강조한다.',
    '2025년 누적 478,802기, 2026년 부분 연도 누적 540,210기. 2026년 연간 추가 집계 61,408기.',
    {'2025_cumulative':478802,'2026_partial_cumulative':540210,'2026_partial_annual':61408},
    '연도별 설치 통계 CSV · 2011–2026년 · 2026 정확한 집계 마감일 미기재',
    '설치 통계의 누적값은 API 조회 재고가 아니며 서로 차감·결합하지 않는다. 2026년은 부분 연도.')

# 10 binary area-proportional treemap; labels confined to their actual rectangles.
ops=frame.groupby(['busiId','busiNm']).size().reset_index(name='charger_count').sort_values(['charger_count','busiId','busiNm'],ascending=[False,True,True])
api_ops=D['operators']['data']
assert ops.head(20).charger_count.tolist()==[r['charger_count'] for r in api_ops[:20]]
top=ops.head(20);vals=list(top.charger_count)+[int(ops.iloc[20:].charger_count.sum())]
labels=[f'{r.busiNm}\n[{r.busiId}]' for r in top.itertuples()]+['기타 운영기관']
assert sum(vals)==len(frame)
def rectangles(weights,x=0,y=0,w=100,h=60):
    if len(weights)==1:return [(x,y,w,h)]
    total=sum(weights);acc=0;split=1;best=float('inf')
    for i in range(1,len(weights)):
        acc+=weights[i-1];distance=abs(acc/total-.5)
        if distance<best:best=distance;split=i
    ratio=sum(weights[:split])/total
    if w>=h:return rectangles(weights[:split],x,y,w*ratio,h)+rectangles(weights[split:],x+w*ratio,y,w*(1-ratio),h)
    return rectangles(weights[:split],x,y,w,h*ratio)+rectangles(weights[split:],x,y+h*ratio,w,h*(1-ratio))
rects=rectangles(vals)
assert np.allclose([w*h/6000 for x,y,w,h in rects],np.array(vals)/sum(vals))
fig,ax=canvas('운영기관별 충전기 구성','상위 20개 (기관 ID, 명칭) 조합 + 기타 · 면적은 충전기 수에 비례',height=10)
ax.set_position([.08,.23,.53,.57])
palette=sns.color_palette('crest',21)
for i,((x,y,w,h),label,n) in enumerate(zip(rects,labels,vals)):
    patch=Rectangle((x,y),w,h,facecolor=palette[i],edgecolor='white',linewidth=2);ax.add_patch(patch)
    cell=f'{i+1:02d}\n{n:,}기' if w>=13 and h>=10 else f'{i+1:02d}'
    text=ax.text(x+w/2,y+h/2,cell,ha='center',va='center',fontsize=9,color='#16364B' if i<5 else 'white',clip_on=True)
    text.set_clip_path(patch)
    fig.add_artist(Rectangle((.64,.782-i*.026),.009,.012,transform=fig.transFigure,facecolor=palette[i],edgecolor='none'))
    full_label=label.replace('\n',' ')
    fig.text(.658,.782-i*.026,f'{i+1:02d} {full_label}  {n:,}기 ({n/len(frame)*100:.2f}%)',fontsize=8.3,va='bottom')
ax.set(xlim=(0,100),ylim=(0,60));ax.axis('off')
save(fig,10,'operator_treemap','운영기관별 충전기 구성 비교',['busiId','busiNm'],'트리맵',
    '다수 기관의 구성비를 면적으로 나타낸다. 이분 분할 레이아웃의 면적 비율을 검증했다.',
    f'기관 ID·명칭 조합 {len(ops)}개. 최대 {top.iloc[0].busiNm} [{top.iloc[0].busiId}] {int(top.iloc[0].charger_count):,}기. 기타 {vals[-1]:,}기.',
    {'operator_pairs':len(ops),'labels':labels,'charger_counts':vals,'area_ratios_verified':True},
    caution=api_caution+' · 앞뒤 공백만 정리 · 다른 명칭 자동 통합 안 함 · 보유/소유권의 법적 의미가 아님')

manifest={'charts':charts,'checks':checks,'boxplot_matplotlib_crosscheck_regions':len(boxes),
    'api_input_sha256':hashlib.sha256(args.inputs.read_bytes()).hexdigest(),
    'source_sha256':{str(p.relative_to(P)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (P/'data/processed').glob('*.csv')},
    'default_deletion':'not_deleted','dpi':200,'new_files_count':len(charts),'graph_kind_count':10,
    'graph_kind_definition':'10 analytical forms counting compound scatter+OLS and histogram+KDE as one each; donut is shared by charts 2 and 6, giving 9 distinct chart labels.'}
# Distinct graph labels: barh, donut, 100% stack, scatter+OLS, boxplot, hist+KDE, heatmap, area, treemap = 9.
manifest['graph_kind_count']=9
(R/'chart_v2_verification.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
analysis=['# CHARGE GAP Python 보고서 그래프 v2','',
    '기존 PNG 10개와 별개인 신규 200dpi PNG 10개. 9개 서로 다른 복합 그래프 형식(도넛 2회).',
    '충전기 그래프는 기본적으로 비삭제 N 523,312기를 사용한다. API의 기본 deletion=all과 구별한다.',
    '전기차 등록 2025-12와 충전기 조회 2026-10-15는 서로 다른 시점이다. 부족률·인과관계는 계산하지 않는다.','']
for chart in charts:
    analysis += [f"## {chart['number']}. {chart['file']}",'',
        f"- 분석 목적: {chart['purpose']}",f"- 사용 변수: {', '.join(chart['variables'])}",
        f"- 종류·선택 이유: {chart['kind']} — {chart['reason']}",
        f"- 실제 분석 결과: {chart['results']}",f"- 출처·기준일: {chart['source']}",
        f"- 해석 주의: {chart['caution']}",'']
(R/'chart_v2_analysis.md').write_text('\n'.join(analysis),encoding='utf-8')
summary=['# v2 그래프 데이터 집계 검증','',
    '- API 정제 CSV 전체 527,433기, 비삭제 523,312기, 삭제 표시 4,121기. 고유 비삭제 충전소 100,590곳.',
    '- 원시 (statId, chgerId) 중복 없음. 지역별 충전소·충전기 합계와 API 반환값을 정제 CSV에서 독립 재계산.',
    '- 지역별 표본: (zcode, statId) 내 고유 chgerId 수. 현재 표본 합계는 전국 고유 statId 수와 동일.',
    '- Qp: 정렬 표본의 h=(n−1)p 위치를 선형 보간. Q1=.25, 중앙값=.5, Q3=.75.',
    '- 울타리 [Q1−1.5IQR, Q3+1.5IQR] 양끝 포함. 수염은 울타리 내부 실제 최솟값/최댓값. 울타리 밖 관측만 이상치.',
    '- n=1은 사분위수·수염 모두 동일. IQR=0도 울타리를 확장하지 않음. 빈 지역 생략, 전체 빈 결과 data=[].',
    '- Matplotlib cbook.boxplot_stats(whis=1.5, autorange=False)와 16개 지역의 사분위수·수염·이상치 수 일치.',
    '- 히스토그램: 양수 523,143기, 결측·무효 169기 제외 명시. log10 구간폭 .125, 구간 합계와 양수 표본 수 일치.',
    '- KDE: log10 Gaussian bandwidth=.125, 실제 값별 빈도 가중, y축은 density×N×.125. 평활 추정이며 측정값을 추가한 것이 아님.',
    '- 출력 6구간 행 합계 100%, 경기 구간별 건수 [140694, 578, 2694, 7104, 3764, 43] 확인.',
    '- 트리맵: 정제 CSV 명칭 앞뒤 공백 정리 후 342개 ID·명칭 조합. 상위20+기타의 합계와 전체 비삭제 합계 일치. 직사각형 면적 비율 검증.',
    '- 누적 설치는 연간 통계의 누적합과 일치. 2026 부분 연도 540,210기. API 재고와 합치지 않음.',
    '- 설치 통계와 EV 등록 CSV도 원본 정제 CSV에서 집계 대조. 모든 신규 PNG PIL 검증 및 200dpi 메타데이터 확인.',
    '', '| 지역 | 충전소 표본 수 | 충전기 수 | Q1 | 중앙값 | Q3 | 수염 하한–상한 | 이상치 표본 수 |',
    '|---|---:|---:|---:|---:|---:|---|---:|']
for b in boxes:summary.append(f"| {b['region_name']} | {b['sample_count']:,} | {b['charger_count']:,} | {b['q1']:g} | {b['median']:g} | {b['q3']:g} | {b['whisker_low']}–{b['whisker_high']} | {b['outlier_count']:,} |")
(R/'chart_v2_data_summary.md').write_text('\n'.join(summary)+'\n',encoding='utf-8')
print(json.dumps({'new_pngs':len(charts),'station_samples':100590,'outlier_samples':total_outliers,'r':r,'r_squared':r2,'output_valid':len(positive)},ensure_ascii=False))
